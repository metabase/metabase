import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (opts: Omit<SetupOpts, "hasEnterprisePlugins"> = {}) =>
  baseSetup({
    ...opts,
    hasEnterprisePlugins: true,
    tokenFeatures: { embedding: true },
  });

describe("EnterpriseSdkOptionCard (EE with token)", () => {
  it("should show 'Configure' button", () => {
    setup();

    expect(screen.getByText("Configure")).toBeInTheDocument();
  });
});
