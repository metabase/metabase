import { getSdkStore } from "./index";

describe("getSdkStore", () => {
  it("seeds isGuestEmbed as null by default so getIsGuestEmbedRaw can distinguish 'not yet known' in tests", () => {
    const store = getSdkStore();
    expect(store.getState().sdk.isGuestEmbed).toBe(null);
  });

  it("seeds isGuestEmbed=true when overridden, so guest-embed consumers see a boolean from frame zero (EMB-1478)", () => {
    const store = getSdkStore({ isGuestEmbed: true });
    expect(store.getState().sdk.isGuestEmbed).toBe(true);
  });

  it("seeds isGuestEmbed=false when overridden, so auth-embed consumers don't fire on the initial null state (EMB-1478)", () => {
    const store = getSdkStore({ isGuestEmbed: false });
    expect(store.getState().sdk.isGuestEmbed).toBe(false);
  });
});
