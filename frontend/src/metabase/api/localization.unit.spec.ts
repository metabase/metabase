import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

import { loadLocalization } from "./localization";

describe("loadLocalization — document direction", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("dir");
    EMBEDDING_SDK_CONFIG.isEmbeddingSdk = false;
  });

  it("reflects the writing direction on <html> in the main app", async () => {
    await loadLocalization("en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
  });

  it("does not mutate the host <html> in embedding SDK mode", async () => {
    EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;
    await loadLocalization("en");
    expect(document.documentElement).not.toHaveAttribute("dir");
  });
});
