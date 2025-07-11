describe("SDK environment config", () => {
  it("sets isEmbeddingSdk() to true when SDK is imported", async () => {
    expect(
      (await import("metabase/embedding-sdk/config")).isEmbeddingSdk(),
    ).toBe(false);

    await import("embedding-sdk");

    expect(
      (await import("metabase/embedding-sdk/config")).isEmbeddingSdk(),
    ).toBe(true);
  });
});
