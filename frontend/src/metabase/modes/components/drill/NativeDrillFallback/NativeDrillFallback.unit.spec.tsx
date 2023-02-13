import * as dom from "metabase/lib/dom";

import { getCleanNativeQuestion } from "metabase-lib/mocks";
import NativeDrillFallback from "./NativeDrillFallback";

const mockIframed = (value: boolean) => {
  const previous = dom.IFRAMED;
  Object.defineProperty(dom, "IFRAMED", {
    configurable: true,
    get() {
      return value;
    },
  });

  return () => {
    Object.defineProperty(dom, "IFRAMED", {
      configurable: true,
      get() {
        return previous;
      },
    });
  };
};

describe("NativeDrillFallback", () => {
  it("should return native drill fallback element on native questions", () => {
    const unmock = mockIframed(false);
    const question = getCleanNativeQuestion();
    const result = NativeDrillFallback({ question });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("fallback-native");
    unmock();
  });

  it("should not return native drill fallback element on native questions when the app is in iframe", () => {
    const unmock = mockIframed(true);

    const question = getCleanNativeQuestion();
    const result = NativeDrillFallback({ question });

    expect(result).toHaveLength(0);
    unmock();
  });
});
