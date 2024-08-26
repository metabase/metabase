import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({ hasEnterprisePlugins: true, ...opts });
}

describe("DashCardParameterMapper > DisabledNativeCardHelpText (EE without token)", () => {
  it.each([{ showMetabaseLinks: false }, { showMetabaseLinks: true }])(
    "should show a parameter help link and ignore the setting showMetabaseLinks = %s",
    ({ showMetabaseLinks }) => {
      setup({ showMetabaseLinks });
      expect(
        screen.getByRole("link", { name: "Learn how" }),
      ).toBeInTheDocument();
    },
  );

  it.each([{ showMetabaseLinks: false }, { showMetabaseLinks: true }])(
    "should show a model help link and ignore the setting `show-metabase-links`: %s",
    ({ showMetabaseLinks }) => {
      setup({ cardType: "model", showMetabaseLinks });
      expect(
        screen.getByRole("link", { name: "Learn more" }),
      ).toBeInTheDocument();
    },
  );
});
