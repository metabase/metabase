import { EMBEDDING_SDK_MINIMUM_REACT_MAJOR_VERSION } from "./react-version";

describe("EMBEDDING_SDK_MINIMUM_REACT_MAJOR_VERSION", () => {
  it("is a whole React major of at least 18", () => {
    expect(EMBEDDING_SDK_MINIMUM_REACT_MAJOR_VERSION).toMatch(/^\d+$/);
    expect(
      Number(EMBEDDING_SDK_MINIMUM_REACT_MAJOR_VERSION),
    ).toBeGreaterThanOrEqual(18);
  });
});
