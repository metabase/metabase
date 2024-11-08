import { setup } from "./setup";

describe("DashboardEntityIdCard (EE without token)", () => {
  it("should return null", async () => {
    const { container } = setup({ hasEnterprisePlugins: true });
    expect(container).toBeEmptyDOMElement();
  });
});
