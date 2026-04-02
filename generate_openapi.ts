import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";

const ENDPOINTS_DIR = "./endpoints";
const SPECS_DIR = "./specs";

interface RawSchemaProperty {
  type: string;
  format?: string;
  description?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  default?: any;
  enum?: string[];
  properties?: Record<string, RawSchemaProperty>;
  items?: RawSchemaProperty;
  required?: boolean;
}

interface RawEndpoint {
  id: string;
  description?: string;
  properties?: Record<string, RawSchemaProperty>;
  "operation-not-allowed"?: string[];
}

function mapA10TypeToOpenAPI(type: string): string {
  switch (type) {
    case "number": return "number";
    case "integer": return "integer";
    case "flag": return "integer";
    default: return type || "string";
  }
}

function convertToOpenAPISchema(prop: RawSchemaProperty): any {
  const schema: any = {
    type: mapA10TypeToOpenAPI(prop.type),
    description: prop.description,
  };

  if (prop.default !== undefined) schema.default = prop.default;
  if (prop.enum) schema.enum = prop.enum;
  if (prop.minLength !== undefined) schema.minLength = prop.minLength;
  if (prop.maxLength !== undefined) schema.maxLength = prop.maxLength;
  if (prop.minimum !== undefined) schema.minimum = prop.minimum;
  if (prop.maximum !== undefined) schema.maximum = prop.maximum;

  if (schema.type === "object" && prop.properties) {
    schema.properties = {};
    for (const [key, val] of Object.entries(prop.properties)) {
      schema.properties[key] = convertToOpenAPISchema(val);
    }
  } else if (schema.type === "array" && prop.items) {
    schema.items = convertToOpenAPISchema(prop.items);
  }

  return schema;
}

function createBaseOpenAPI(category: string): any {
  return {
    openapi: "3.0.0",
    info: {
      title: `A10 aXAPI v3 Documentation - ${category.toUpperCase()}`,
      version: "3.0.0",
      description: `Auto-generated documentation for the ${category} category.`,
    },
    servers: [
      {
        url: "https://{thunder_ip}/axapi/v3",
        variables: {
          thunder_ip: {
            default: "thunder.example.com",
            description: "IP address or hostname of the Thunder device",
          },
        },
      },
    ],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        SessionToken: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description: "ACOS Session Token (e.g., A10 {token})",
        },
      },
    },
    security: [{ SessionToken: [] }],
  };
}

export function getAllowedMethods(path: string, operationNotAllowed?: string[]): string[] {
  const isReadOnly = path.endsWith("/oper") || path.endsWith("/stats") || path.includes("/oper/") || path.includes("/stats/");
  if (isReadOnly) return ["get"];

  const allMethods = ["get", "post", "put", "delete"];
  const disallowed = (operationNotAllowed || []).map(m => m.toUpperCase());
  return allMethods.filter(m => !disallowed.includes(m.toUpperCase()));
}

async function generate() {
  if (existsSync(SPECS_DIR)) {
    await rm(SPECS_DIR, { recursive: true, force: true });
  }
  await mkdir(SPECS_DIR, { recursive: true });
  const files = await readdir(ENDPOINTS_DIR);

  const categorySpecs: Record<string, any> = {};
  const processedCount: Record<string, number> = {};
  const searchIndex: any[] = [];

  console.log(`Scanning ${files.length} files...`);

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    try {
      const content = await readFile(join(ENDPOINTS_DIR, file), "utf-8");
      const raw: RawEndpoint = JSON.parse(content);
      const path = raw.id;
      if (!path) {
        // console.warn(`File ${file} has no id/path, skipping.`);
        continue;
      }

      // Extract category from path (e.g., /axapi/v3/ddos/zone -> ddos)
      const pathParts = path.replace("/axapi/v3/", "").split("/").filter(Boolean);
      let category = pathParts[0] || "general";

      // Sanitizing category for filename
      category = category.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();

      if (!categorySpecs[category]) {
        categorySpecs[category] = createBaseOpenAPI(category);
        processedCount[category] = 0;
      }
      const openapi = categorySpecs[category];
      processedCount[category]++;

      const tag = category.toUpperCase();

      if (!openapi.paths[path]) {
        openapi.paths[path] = { parameters: [] };
      }

      const pathParams = Array.from(path.matchAll(/\{([^}]+)\}/g)).map((match) => ({
        name: match[1],
        in: "path",
        required: true,
        schema: { type: "string" },
        description: `ID for ${match[1]}`,
      }));

      for (const p of pathParams) {
        if (!openapi.paths[path].parameters.find((existing: any) => existing.name === p.name)) {
          openapi.paths[path].parameters.push(p);
        }
      }

      const methods = getAllowedMethods(path, raw["operation-not-allowed"]);

      // If all methods disallowed, skip this path entirely
      if (methods.length === 0) {
        processedCount[category]--;
        if (openapi.paths[path]) delete openapi.paths[path];
        continue;
      }

      const resourceName = basename(file, ".json");
      const schema = {
        type: "object",
        properties: {},
      };

      if (raw.properties) {
        for (const [key, val] of Object.entries(raw.properties)) {
          (schema.properties as any)[key] = convertToOpenAPISchema(val);
        }
      }
      openapi.components.schemas[resourceName] = schema;

      for (const method of methods) {
        const operation: any = {
          tags: [tag],
          description: raw.description || `Endpoint for ${path}`,
          responses: {
            "200": {
              description: "Successful response",
              content: { "application/json": { schema: { $ref: `#/components/schemas/${resourceName}` } } },
            },
          },
        };

        if (method === "post" || method === "put") {
          operation.requestBody = {
            content: { "application/json": { schema: { $ref: `#/components/schemas/${resourceName}` } } },
          };
        }
        openapi.paths[path][method] = operation;
      }

      // Add to search index
      searchIndex.push({
        path: path,
        description: raw.description || `Endpoint for ${path}`,
        category: category.toUpperCase(),
        fileName: `${category}.json`,
      });
    } catch (err: any) {
      console.warn(`Error processing ${file}:`, err?.message || err);
    }
  }

  // Write all category specs
  const manifest: any[] = [];
  console.log(`Writing ${Object.keys(categorySpecs).length} category specifications...`);

  for (const [category, spec] of Object.entries(categorySpecs)) {
    const fileName = `${category}.json`;
    try {
      await writeFile(join(SPECS_DIR, fileName), JSON.stringify(spec, null, 2));
      manifest.push({
        name: category.toUpperCase(),
        fileName: fileName,
        count: processedCount[category],
      });
    } catch (err: any) {
      console.error(`Failed to write spec for ${category}:`, err?.message || err);
    }
  }

  // Write manifest
  manifest.sort((a, b) => (b.count || 0) - (a.count || 0)); // Most populated first
  await writeFile(join(SPECS_DIR, "manifest.json"), JSON.stringify({ categories: manifest }, null, 2));

  // Write search index
  console.log(`Writing search index with ${searchIndex.length} entries...`);
  await writeFile(join(SPECS_DIR, "search-index.json"), JSON.stringify(searchIndex));

  console.log(`DONE: Generated ${manifest.length} categorized specifications.`);
}

generate().catch(console.error);
