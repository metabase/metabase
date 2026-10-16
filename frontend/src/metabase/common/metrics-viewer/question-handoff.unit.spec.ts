import {
  getQuestionReturnUrl,
  withQuestionReturnUrl,
} from "./question-handoff";

describe("question return navigation", () => {
  it("preserves the full draft link and viewer hash", () => {
    const url = withQuestionReturnUrl("/explore#summary", "/question#draft");
    const parsed = new URL(url, "http://localhost");
    expect(parsed.hash).toBe("#summary");
    expect(getQuestionReturnUrl(parsed.search)).toBe("/question#draft");
  });

  it.each([
    "https://example.com",
    "//example.com",
    "/admin",
    "/question/1",
    "",
  ])('rejects an unrelated return destination "%s"', (returnTo) => {
    expect(
      getQuestionReturnUrl(new URLSearchParams({ returnTo }).toString()),
    ).toBeNull();
  });
});
