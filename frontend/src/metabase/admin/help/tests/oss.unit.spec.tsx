import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";

import { VERSION_TAG, setup } from "./setup";

describe("Help (OSS)", () => {
  it("links `Get help` to the free help page with the instance version and no diagnostic info", async () => {
    setup();

    const link = await screen.findByRole("link", { name: /Get help/ });
    expect(link).toHaveAttribute(
      "href",
      `https://www.metabase.com/help?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=${VERSION_TAG}`,
    );
  });

  it("does not show the `Helping hand` section", async () => {
    setup({ tokenFeatures: { "support-users": true } });

    expect(
      await screen.findByRole("link", { name: /Get help/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Helping hand" }),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/ee/support-access-grant"),
    ).toHaveLength(0);
  });
});
