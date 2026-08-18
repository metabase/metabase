import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";

import { GlobalStyles } from "./GlobalStyles";

const setup = (siteUrl: string | null) => {
  const settings = mockSettings({ "site-url": siteUrl as unknown as string });

  renderWithProviders(<GlobalStyles />, {
    storeInitialState: { settings },
  });
};

describe("GlobalStyles", () => {
  it("renders when site-url is set", () => {
    expect(() => setup("http://localhost:3000")).not.toThrow();
  });

  // GlobalStyles is mounted above the router and any error boundary, so a throw here takes down the
  // entire app -- including /login -- on instances that never had site-url set.
  it("renders when site-url is null", () => {
    expect(() => setup(null)).not.toThrow();
  });
});
