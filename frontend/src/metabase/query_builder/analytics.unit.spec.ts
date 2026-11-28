import { readFileSync } from "fs";
import { join } from "path";

import * as Snowplow from "@snowplow/browser-tracker";
import Ajv from "ajv";

import { createMockMetadata } from "__support__/metadata";
import { mockSettings } from "__support__/settings";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";

import { trackNotebookNativePreviewShown } from "./analytics";

jest.mock("@snowplow/browser-tracker", () => ({
  trackSelfDescribingEvent: jest.fn(),
}));

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
// These tests check what the real tracker sends to Snowplow.
jest.unmock("metabase/analytics");

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

describe("trackNotebookNativePreviewShown", () => {
  beforeEach(() => {
    jest.mocked(Snowplow.trackSelfDescribingEvent).mockClear();
    mockSettings({
      "anon-tracking-enabled": true,
      "snowplow-enabled": true,
      "metaplow-tracking-enabled": false,
    });
  });

  it.each([
    {
      isShown: true,
      card: createMockCard({ id: 7 }),
      expected: { event: "notebook_native_preview_shown", question_id: 7 },
    },
    {
      isShown: false,
      card: createMockUnsavedCard(),
      expected: { event: "notebook_native_preview_hidden", question_id: 0 },
    },
  ])(
    "should send $expected.event to Snowplow as valid self-describing JSON",
    ({ isShown, card, expected }) => {
      trackNotebookNativePreviewShown(
        new Question(card, createMockMetadata({})),
        isShown,
      );

      const payload = getSentPayload();
      expect(payload.data).toEqual(expected);

      // Iglu schemas use their own meta-schema and keywords.
      const validate = new Ajv({
        strict: false,
        validateSchema: false,
      }).compile(loadIgluSchema(payload.schema));
      expect(validate(payload.data)).toBe(true);
    },
  );
});
