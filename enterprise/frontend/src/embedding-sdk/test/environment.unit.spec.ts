describe("SDK environment config", () => {
  it("should have isSdk set to true", async () => {
    // isSdk should be false if SDK is not imported
    expect(
      (await import("metabase/embedding-sdk/config")).EMBEDDING_SDK_CONFIG
        .isSdk,
    ).toBe(false);

    await import("embedding-sdk");

    // isSdk should be true if SDK is imported
    expect(
      (await import("metabase/embedding-sdk/config")).EMBEDDING_SDK_CONFIG
        .isSdk,
    ).toBe(true);
  });
});
