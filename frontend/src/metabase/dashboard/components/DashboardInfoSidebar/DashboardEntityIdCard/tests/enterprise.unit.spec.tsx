import { setup } from "./setup";

describe("DashboardEntityIdCard (EE without token)", () => {
  it("should return null", async () => {
    const { container } = setup({ shouldSetupEnterprisePlugins: true });
    expect(container).toBeEmptyDOMElement();
  });
});
