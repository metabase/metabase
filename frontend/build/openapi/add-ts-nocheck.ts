#!/usr/bin/env bun
/**
 * Post-processing step for `types:generate`.
 *
 * Prepends `// @ts-nocheck` to the generated types file: hey-api re-includes
 * excluded-but-referenced schemas (e.g. MetabaseLegacyMbqlSchema*, which have
 * circular references that fail tsc with TS2456), so the generated file's
 * internals cannot be guaranteed to type-check. Consumer call-sites still get
 * full checking — @ts-nocheck only exempts this file's own body.
 */
import { readFileSync, writeFileSync } from "node:fs";

const TYPES_FILE = "frontend/src/metabase-types/openapi/types.gen.ts";
const BANNER = "// @ts-nocheck -- generated file; see add-ts-nocheck.ts\n";

const content = readFileSync(TYPES_FILE, "utf8");

if (!content.startsWith(BANNER)) {
  writeFileSync(TYPES_FILE, BANNER + content);
}
