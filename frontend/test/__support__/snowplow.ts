import { readFileSync } from "fs";
import { join } from "path";

import Ajv from "ajv";

import type { SchemaType } from "metabase-types/analytics";

type SchemaVersion = `${number}-${number}-${number}`;

/**
 * Checks an event against the Iglu schema that Snowplow validates it with.
 * The version must match the one `metabase/analytics/event.ts` sends.
 */
export function expectValidSchemaEvent(
  schemaName: SchemaType,
  version: SchemaVersion,
  event: unknown,
) {
  const schema: unknown = JSON.parse(
    readFileSync(
      join(
        __dirname,
        "../../..",
        `snowplow/iglu-client-embedded/schemas/com.metabase/${schemaName}/jsonschema/${version}`,
      ),
      "utf-8",
    ),
  );
  if (typeof schema !== "object" || schema == null) {
    throw new Error(`Invalid schema ${schemaName}/${version}`);
  }
  // Iglu schemas use their own meta-schema and keywords. Snowplow Micro
  // checks formats such as `date-time`, but Ajv needs a plugin for them.
  const validate = new Ajv({
    strict: false,
    validateSchema: false,
    validateFormats: false,
  }).compile(schema);
  const isValid = validate(event);
  if (!isValid) {
    throw new Error(
      `Invalid ${schemaName} event ${JSON.stringify(event)}: ${JSON.stringify(validate.errors)}`,
    );
  }
}

/**
 * Checks every event of a schema that a mocked `trackSchemaEvent` received,
 * like `H.expectNoBadSnowplowEvents` does in e2e tests.
 */
export function expectNoBadSchemaEvents(
  calls: readonly (readonly unknown[])[],
  schemaName: SchemaType,
  version: SchemaVersion,
) {
  calls
    .filter(([name]) => name === schemaName)
    .forEach(([, event]) => expectValidSchemaEvent(schemaName, version, event));
}
