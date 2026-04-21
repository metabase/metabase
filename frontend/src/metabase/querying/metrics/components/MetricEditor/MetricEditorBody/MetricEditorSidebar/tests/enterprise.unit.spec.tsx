import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts = {}) {
  baseSetup({ ...opts });
}

describe("MetricEditorSidebar (EE without a token)", () => {
  it("should render the metric docs link by default", () => {
    setup({ showMetabaseLinks: true });
    expect(screen.getByRole("link", { name: /Docs/ })).toBeInTheDocument();
  });

  it("should render the metric docs link even if the setting is turned off", () => {
    setup({ showMetabaseLinks: false });
    expect(screen.getByRole("link", { name: /Docs/ })).toBeInTheDocument();
  });
});
