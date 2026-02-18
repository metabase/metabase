import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("PythonTransformsUpsellModal - OSS", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows upsell CTA when instance is self-hosted and clicking it closes modal", async () => {
    setup({ isHosted: false, isStoreUser: true });

    const upgradeLink = (await screen.findByRole("link", {
      name: /Get Python transforms/,
    })) as HTMLAnchorElement;

    expect(upgradeLink.href).toMatch(
      "https://www.metabase.com/upgrade/data-studio",
    );
  });
});
