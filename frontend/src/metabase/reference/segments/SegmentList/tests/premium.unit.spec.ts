import { screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  return baseSetup({
    tokenFeatures: { whitelabel: true },
    enterprisePlugins: ["whitelabel"],
    ...opts,
  });
}

describe("SegmentList (EE with token)", () => {
  describe("Admins", () => {
    const adminUser = createMockUser({
      is_superuser: true,
    });

    it("should render help link when `show-metabase-links: true`", async () => {
      await setup({ user: adminUser, showMetabaseLinks: true });

      expect(
        screen.getByText("Segments are interesting subsets of tables"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Learn how to create segments"),
      ).toBeInTheDocument();
    });

    it("should not render help link when `show-metabase-links: false`", async () => {
      await setup({ user: adminUser, showMetabaseLinks: false });

      expect(
        screen.getByText("Segments are interesting subsets of tables"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Learn how to create segments"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Non-admins", () => {
    const user = createMockUser();

    it("should not render help link", async () => {
      await setup({ user });

      expect(
        screen.getByText("Segments are interesting subsets of tables"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Learn how to create segments"),
      ).not.toBeInTheDocument();
    });
  });
});
