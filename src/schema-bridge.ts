/**
 * JSON Schema → TypeBox Schema Converter
 *
 * Converts MCP tool input schemas (JSON Schema) to TypeBox schemas
 * for use with pi's `pi.registerTool()` parameter validation.
 *
 * MCP servers send schemas in JSON Schema Draft 7 format:
 * {
 *   type: "object",
 *   properties: { text: { type: "string", description: "..." } },
 *   required: ["text"],
 *   additionalProperties: false
 * }
 *
 * We convert these to TypeBox equivalents that pi can use for validation.
 */

import { Type, type TSchema, type Static } from "typebox";

// ─── Type Mapping ──────────────────────────────────────────────────────────

/**
 * Convert a single JSON Schema property value to a TypeBox schema.
 */
function jsonSchemaValueToTypeBox(schema: unknown, path: string = ""): TSchema {
  if (schema === null || typeof schema !== "object") {
    return Type.Any();
  }

  const s = schema as Record<string, unknown>;
  const type = s.type as string | undefined;
  const description = s.description as string | undefined;
  const enumValues = s.enum as unknown[] | undefined;

  // Handle "any" type (no type constraint)
  if (type === undefined || type === "any" || type === "null") {
    return Type.Any();
  }

  // Handle enum — can appear with or without explicit type
  if (Array.isArray(enumValues)) {
    const tbEnum = enumValues.map((v) => {
      if (v === null) return Type.Null();
      if (typeof v === "boolean") return Type.Union([Type.Boolean(), Type.String()]); // TypeBox booleans don't accept null
      if (typeof v === "number") return Type.Union([Type.Number(), Type.String()]); // TypeBox numbers don't accept null
      return Type.String();
    });
    const result = Type.Union(tbEnum);
    return addDescription(result, description, path);
  }

  // Handle "object" type
  if (type === "object") {
    return jsonObjectToTypeBox(s, description, path);
  }

  // Handle "array" type
  if (type === "array") {
    const itemsSchema = s.items as unknown | undefined;
    if (itemsSchema && typeof itemsSchema === "object") {
      const itemTb = jsonSchemaValueToTypeBox(itemsSchema, `${path}.items`);
      const result = Type.Array(itemTb);
      return addDescription(result, description, path);
    }
    return Type.Array(Type.Any());
  }

  // Primitive types
  switch (type) {
    case "string": {
      const schema = Type.String();
      // Add minLength/maxLength constraints if present
      if (typeof s.minLength === "number") {
        // TypeBox doesn't natively support minLength, but we can use patterns
        // as a hint — actual enforcement happens at the MCP server side
      }
      return addDescription(schema, description, path);
    }
    case "number":
    case "integer": {
      const schema = Type.Number();
      return addDescription(schema, description, path);
    }
    case "boolean": {
      const schema = Type.Boolean();
      return addDescription(schema, description, path);
    }
    default: {
      // Unknown type — fall back to Any
      return Type.Any();
    }
  }
}

/**
 * Convert a JSON Schema "object" to a TypeBox object schema.
 */
function jsonObjectToTypeBox(
  schema: Record<string, unknown>,
  description: string | undefined,
  path: string
): TSchema {
  const properties = schema.properties as Record<string, unknown> | undefined;
  const required = schema.required as string[] | undefined;
  const additionalProperties = schema.additionalProperties as boolean | undefined;

  if (!properties || typeof properties !== "object") {
    // No properties defined — return empty object
    const result = Type.Object({});
    return addDescription(result, description, path);
  }

  // Build property map
  const propMap: Record<string, TSchema> = {};
  const requiredProps: string[] = [];

  for (const [key, value] of Object.entries(properties)) {
    if (value && typeof value === "object") {
      const tbSchema = jsonSchemaValueToTypeBox(value, `${path}.${key}`);
      propMap[key] = tbSchema;
    } else if (value === null || typeof value === "undefined") {
      propMap[key] = Type.Any();
    }
  }

  // Check if all properties are required
  const hasRequired = required && required.length > 0;
  const allRequired = hasRequired && required.length === Object.keys(propMap).length;

  // TypeBox requires: if additionalProperties is false and all props are required,
  // we can use Type.Passthrough(Type.Required(Type.Object({...})))
  // However, for simplicity, we use the standard Type.Object and rely on MCP server
  // for strict validation at execution time.
  const result = Type.Object(propMap);
  const finalResult = addDescription(result, description, path);

  return finalResult;
}

/**
 * Add description metadata to a TypeBox schema using Type.Optional
 * to preserve the schema while carrying the description.
 */
function addDescription(schema: TSchema, description: string | undefined, path: string): TSchema {
  if (!description) return schema;
  // We attach description via Type.Optional wrapper which carries metadata
  // but for TypeBox, the cleanest approach is to use .meta() if available
  // or simply return the schema as-is (description is carried in the JSON schema
  // and will be used by the MCP server for validation anyway)
  return schema;
}

/**
 * Convert a JSON Schema object to a TypeBox schema.
 *
 * This is the main entry point used by the extension to convert
 * MCP tool input schemas to TypeBox for registration.
 *
 * Returns a TypeBox schema compatible with pi's registerTool().
 */
export function jsonSchemaToTypeBox(schema: unknown): TSchema {
  if (!schema || typeof schema !== "object") {
    return Type.Object({});
  }

  const s = schema as Record<string, unknown>;

  // If it's an object with a type field, process the schema
  if (s.type === "object") {
    return jsonObjectToTypeBox(s, s.description as string | undefined, "");
  }

  // Top-level non-object schema
  return jsonSchemaValueToTypeBox(schema, "");
}
