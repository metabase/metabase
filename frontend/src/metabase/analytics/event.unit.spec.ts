import { readFileSync } from "fs";
import { join } from "path";

import * as Snowplow from "@snowplow/browser-tracker";
import Ajv from "ajv";

import { mockSettings } from "__support__/settings";
import type { SchemaEventMap } from "metabase-types/analytics";

import { trackSchemaEvent } from "./event";

jest.mock("@snowplow/browser-tracker", () => ({
  trackSelfDescribingEvent: jest.fn(),
}));

const IGLU_URI_PATTERN =
  /^iglu:com\.metabase\/(?<name>[a-z_]+)\/jsonschema\/(?<version>\d+-\d+-\d+)$/;

function loadIgluSchema(uri: string): object {
  const match = uri.match(IGLU_URI_PATTERN);
  if (!match?.groups) {
    throw new Error(`Not a Metabase Iglu schema URI: ${uri}`);
  }
  const { name, version } = match.groups;
  const schema: unknown = JSON.parse(
    readFileSync(
      join(
        __dirname,
        "../../../..",
        "snowplow/iglu-client-embedded/schemas/com.metabase",
        name,
        "jsonschema",
        version,
      ),
      "utf-8",
    ),
  );
  if (typeof schema !== "object" || schema == null) {
    throw new Error(`Invalid schema: ${uri}`);
  }
  return schema;
}

function getSentPayload() {
  const trackSelfDescribingEvent = jest.mocked(
    Snowplow.trackSelfDescribingEvent,
  );
  expect(trackSelfDescribingEvent).toHaveBeenCalledTimes(1);
  const [{ event }] = trackSelfDescribingEvent.mock.calls[0];
  return event;
}

describe("trackSchemaEvent", () => {
  beforeEach(() => {
    jest.mocked(Snowplow.trackSelfDescribingEvent).mockClear();
    mockSettings({
      "anon-tracking-enabled": true,
      "snowplow-enabled": true,
      "metaplow-tracking-enabled": false,
    });
  });

  it.each<SchemaEventMap["question"]>([
    {
      event: "column_extract_via_shortcut",
      custom_expressions_used: ["get-hour"],
      database_id: 1,
      question_id: 0,
    },
    {
      event: "column_combine_via_shortcut",
      custom_expressions_used: ["concat"],
      database_id: 1,
      question_id: 0,
    },
  ])(
    "should send the $event event to Snowplow as valid self-describing JSON",
    (event) => {
      trackSchemaEvent("question", event);

      const payload = getSentPayload();
      expect(payload.data).toEqual(event);

      // Iglu schemas use their own meta-schema and keywords.
      const validate = new Ajv({
        strict: false,
        validateSchema: false,
      }).compile(loadIgluSchema(payload.schema));
      expect(validate(payload.data)).toBe(true);
    },
  );

  it("should not send events when tracking is disabled", () => {
    mockSettings({
      "anon-tracking-enabled": false,
      "snowplow-enabled": true,
    });

    trackSchemaEvent("question", {
      event: "column_extract_via_shortcut",
      custom_expressions_used: ["get-hour"],
      database_id: 1,
      question_id: 0,
    });

    expect(Snowplow.trackSelfDescribingEvent).not.toHaveBeenCalled();
  });
});
