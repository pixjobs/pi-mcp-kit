/**
 * Shared types for pi-mcp-kit.
 */

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
