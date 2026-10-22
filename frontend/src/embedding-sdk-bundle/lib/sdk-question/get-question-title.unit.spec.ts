import type Question from "metabase-lib/v1/Question";

import { getQuestionTitle } from "./get-question-title";

jest.mock("metabase-lib", () => ({
  queryDisplayInfo: jest.fn().mockReturnValue({ isNative: false }),
}));

jest.mock("metabase/query_builder", () => ({
  getAdHocQuestionDescription: jest
    .fn()
    .mockReturnValue("Products, with 2 filters"),
  shouldRenderAdhocDescription: jest.fn().mockReturnValue(true),
}));

function stubQuestion({
  displayName,
}: {
  displayName: string | null;
}): Question {
  // Minimal stub — only the methods getQuestionTitle reads
  return {
    displayName: () => displayName,
    isSaved: () => !!displayName,
    query: () => ({}),
  } as unknown as Question;
}

describe("getQuestionTitle", () => {
  it("returns null for undefined question", () => {
    expect(getQuestionTitle(undefined)).toBeNull();
  });

  it("returns the saved name for a saved question", () => {
    const question = stubQuestion({ displayName: "My Saved Question" });
    expect(getQuestionTitle(question)).toBe("My Saved Question");
  });

  it("returns the name for an unsaved question that carries a name (click-behavior target)", () => {
    // Simulates the deserialized card from a click-behavior URL: has a name
    // but no id because getCleanCard omits `id` from serialization.
    // Minimal stub — only the methods getQuestionTitle reads
    const question = {
      displayName: () => "Click Target Question",
      isSaved: () => false,
      query: () => ({}),
    } as unknown as Question;

    expect(getQuestionTitle(question)).toBe("Click Target Question");
  });

  it("falls back to the ad-hoc description for a nameless unsaved question", () => {
    // Minimal stub — only the methods getQuestionTitle reads
    const question = {
      displayName: () => null,
      isSaved: () => false,
      query: () => ({}),
    } as unknown as Question;

    expect(getQuestionTitle(question)).toBe("Products, with 2 filters");
  });

  it("passes the name through a content translation function", () => {
    const question = stubQuestion({ displayName: "Translated Title" });
    const tc = (s: string) => `[translated] ${s}`;
    expect(getQuestionTitle(question, tc)).toBe(
      "[translated] Translated Title",
    );
  });
});
