import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

describe("SDK environment config", () => {
  beforeEach(() => {
    EMBEDDING_SDK_CONFIG.isEmbeddingSdk = false;
  });

  it("sets isEmbeddingSdk() to true when SDK is imported", async () => {
    expect(
      (await import("metabase/embedding-sdk/config")).isEmbeddingSdk(),
    ).toBe(false);

    await import("embedding-sdk-package");

    expect(
      (await import("metabase/embedding-sdk/config")).isEmbeddingSdk(),
    ).toBe(true);
  });

  it("sets isEmbeddingSdk() to true when SDK bundle is imported", async () => {
    expect(
      (await import("metabase/embedding-sdk/config")).isEmbeddingSdk(),
    ).toBe(false);

    await import("embedding-sdk-bundle");

    expect(
      (await import("metabase/embedding-sdk/config")).isEmbeddingSdk(),
    ).toBe(true);
  });
});
