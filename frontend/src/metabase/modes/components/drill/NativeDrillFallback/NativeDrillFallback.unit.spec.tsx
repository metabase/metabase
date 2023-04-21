jest.doMock("metabase/lib/dom");
import * as dom from "metabase/lib/dom";
import { getCleanNativeQuestion } from "metabase-lib/mocks";
import NativeDrillFallback from "./NativeDrillFallback";

describe("NativeDrillFallback", () => {
  let isWithinIframeSpy: jest.SpyInstance;

  beforeEach(() => {
    isWithinIframeSpy = jest.spyOn(dom, "isWithinIframe");
  });

  afterEach(() => {
    isWithinIframeSpy.mockRestore();
  });

  it("should return native drill fallback element on native questions", async () => {
    isWithinIframeSpy.mockReturnValue(false);

    const question = getCleanNativeQuestion();
    const result = NativeDrillFallback({ question });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("fallback-native");
  });

  it("should not return native drill fallback element on native questions when the app is in iframe", async () => {
    isWithinIframeSpy.mockReturnValue(true);

    const question = getCleanNativeQuestion();
    const result = NativeDrillFallback({ question });

    expect(result).toHaveLength(0);
  });
});
