import { setup } from "./setup";

describe("DashboardEntityIdCard (OSS)", () => {
  it("should return null", async () => {
    const { container } = setup();
    expect(container).toBeEmptyDOMElement();
  });
});
