/**
 * Mock `isEmbeddingSdk()` to return the given value.
 * Used for mocking Embedding SDK-specific scenarios.
 */
export async function mockIsEmbeddingSdk(isEmbeddingSdk: boolean = true) {
  const configModule = await import("metabase/embedding-sdk/config");
  jest.spyOn(configModule, "isEmbeddingSdk").mockReturnValue(isEmbeddingSdk);
}
