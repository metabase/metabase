import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("DashboardEntityIdCard (EE without token)", () => {
  it("should return null", async () => {
    setup({ shouldSetupEnterprisePlugins: true });
    const container = screen.getByTestId("test-container");
    expect(container).toBeEmptyDOMElement();
  });
});
