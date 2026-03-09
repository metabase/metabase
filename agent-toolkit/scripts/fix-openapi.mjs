/**
 * Fixes known issues in the Metabase OpenAPI spec that prevent
 * openapi-typescript from generating types.
 *
 * Known issues:
 * - Schema property key "nil%" contains a bare % that breaks decodeURIComponent
 */
import { readFileSync, writeFileSync } from "fs";

const inputPath = "../openapi_export.json";
const outputPath = "openapi_fixed.json";

const spec = JSON.parse(readFileSync(inputPath, "utf8"));

// Fix: rename "nil%" property key to "nil_pct"
const schema =
  spec.components?.schemas?.[
    "metabase.lib.schema.metadata.fingerprint..fingerprint.global"
  ];
if (schema?.properties?.["nil%"]) {
  schema.properties["nil_pct"] = schema.properties["nil%"];
  delete schema.properties["nil%"];
}

writeFileSync(outputPath, JSON.stringify(spec));
console.log("Fixed OpenAPI spec written to", outputPath);
