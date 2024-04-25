import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({
    hasEnterprisePlugins: true,
    ...opts,
  });
}

describe("EmptyFormPlaceholder (EE without token)", () => {
  it("should render help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });
    expect(
      screen.getByText("Build custom forms and business logic."),
    ).toBeInTheDocument();
    expect(screen.getByText("See an example")).toBeInTheDocument();
  });

  it("should render help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });
    expect(
      screen.getByText("Build custom forms and business logic."),
    ).toBeInTheDocument();
    expect(screen.getByText("See an example")).toBeInTheDocument();
  });
});
