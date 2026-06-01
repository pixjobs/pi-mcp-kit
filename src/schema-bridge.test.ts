/**
 * Tests for JSON Schema → TypeBox schema converter.
 */

import { describe, it, expect } from "vitest";
import { Type } from "typebox";
import { jsonSchemaToTypeBox } from "./schema-bridge.js";

describe("jsonSchemaToTypeBox", () => {
  it("converts a simple object schema with string and number", () => {
    const schema = {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to echo" },
        count: { type: "number", description: "A number" },
      },
      required: ["text", "count"],
      additionalProperties: false,
    };

    const result = jsonSchemaToTypeBox(schema) as ReturnType<typeof Type.Object>;
    expect(result).toBeDefined();

    // The result should be a Type.Object with the right keys
    const props = (result as any).properties;
    expect(props).toHaveProperty("text");
    expect(props).toHaveProperty("count");
  });

  it("handles object with only string fields", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    };

    const result = jsonSchemaToTypeBox(schema);
    expect(result).toBeDefined();
  });

  it("handles object with nested properties", () => {
    const schema = {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name"],
          additionalProperties: false,
        },
      },
      required: ["user"],
      additionalProperties: false,
    };

    const result = jsonSchemaToTypeBox(schema);
    expect(result).toBeDefined();
  });

  it("handles empty object schema", () => {
    const schema = {
      type: "object",
      properties: {},
    };

    const result = jsonSchemaToTypeBox(schema);
    expect(result).toBeDefined();
  });

  it("handles array type", () => {
    const schema = {
      type: "array",
      items: { type: "string" },
    };

    const result = jsonSchemaToTypeBox(schema);
    expect(result).toBeDefined();
  });

  it("handles string type directly", () => {
    const schema = { type: "string" };
    const result = jsonSchemaToTypeBox(schema);
    expect(result).toBeDefined();
  });

  it("handles number type directly", () => {
    const schema = { type: "number" };
    const result = jsonSchemaToTypeBox(schema);
    expect(result).toBeDefined();
  });

  it("handles boolean type directly", () => {
    const schema = { type: "boolean" };
    const result = jsonSchemaToTypeBox(schema);
    expect(result).toBeDefined();
  });

  it("handles integer type", () => {
    const schema = { type: "integer" };
    const result = jsonSchemaToTypeBox(schema);
    expect(result).toBeDefined();
  });

  it("handles enum in properties", () => {
    const schema = {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "add", "remove"] },
      },
      required: ["action"],
      additionalProperties: false,
    };

    const result = jsonSchemaToTypeBox(schema);
    expect(result).toBeDefined();
  });

  it("handles null input gracefully", () => {
    const result = jsonSchemaToTypeBox(null as any);
    expect(result).toBeDefined();
  });

  it("handles undefined input gracefully", () => {
    const result = jsonSchemaToTypeBox(undefined);
    expect(result).toBeDefined();
  });

  it("handles non-object input gracefully", () => {
    const result = jsonSchemaToTypeBox("not an object" as any);
    expect(result).toBeDefined();
  });

  it("matches the mock server's echo tool schema format", () => {
    // This matches exactly what the mock server produces
    const echoSchema = {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to echo" },
      },
      required: ["text"],
      additionalProperties: false,
    };

    const result = jsonSchemaToTypeBox(echoSchema);
    expect(result).toBeDefined();
    const props = (result as any).properties;
    expect(props).toHaveProperty("text");
  });

  it("matches the mock server's add tool schema format", () => {
    const addSchema = {
      type: "object",
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" },
      },
      required: ["a", "b"],
      additionalProperties: false,
    };

    const result = jsonSchemaToTypeBox(addSchema);
    expect(result).toBeDefined();
    const props = (result as any).properties;
    expect(props).toHaveProperty("a");
    expect(props).toHaveProperty("b");
  });
});
