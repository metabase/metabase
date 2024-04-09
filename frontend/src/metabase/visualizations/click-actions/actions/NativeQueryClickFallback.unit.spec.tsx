jest.doMock("metabase/lib/dom");

import { createMockMetadata } from "__support__/metadata";
import * as dom from "metabase/lib/dom";
import Question from "metabase-lib/v1/Question";
import {
  createSampleDatabase,
  createEmptyAdHocNativeCard,
} from "metabase-types/api/mocks/presets";

import { NativeQueryClickFallback } from "./NativeQueryClickFallback";

function getQuestion() {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });
  return new Question(createEmptyAdHocNativeCard(), metadata);
}

describe("NativeQueryClickFallback", () => {
  let isWithinIframeSpy: jest.SpyInstance;

  beforeEach(() => {
    isWithinIframeSpy = jest.spyOn(dom, "isWithinIframe");
  });

  afterEach(() => {
    isWithinIframeSpy.mockRestore();
  });

  it("should return native drill fallback element on native questions", async () => {
    isWithinIframeSpy.mockReturnValue(false);

    const question = getQuestion();
    const result = NativeQueryClickFallback({ question });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("fallback-native");
  });

  it("should not return native drill fallback element on native questions when the app is in iframe", async () => {
    isWithinIframeSpy.mockReturnValue(true);

    const question = getQuestion();
    const result = NativeQueryClickFallback({ question });

    expect(result).toHaveLength(0);
  });
});
