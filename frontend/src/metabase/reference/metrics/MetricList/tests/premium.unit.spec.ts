import { screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { whitelabel: true },
    ...opts,
  });
}

describe("MetricList (EE with token)", () => {
  describe("Admins", () => {
    const adminUser = createMockUser({
      is_superuser: true,
    });

    it("should render help link when `show-metabase-links: true`", () => {
      setup({ user: adminUser, showMetabaseLinks: true });

      expect(
        screen.getByText(
          "Metrics are the official numbers that your team cares about",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Learn how to create metrics"),
      ).toBeInTheDocument();
    });

    it("should not render help link when `show-metabase-links: false`", () => {
      setup({ user: adminUser, showMetabaseLinks: false });

      expect(
        screen.getByText(
          "Metrics are the official numbers that your team cares about",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Learn how to create metrics"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Non-admins", () => {
    const user = createMockUser();
    it("should not render help link", () => {
      setup({ user });

      expect(
        screen.getByText(
          "Metrics are the official numbers that your team cares about",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Learn how to create metrics"),
      ).not.toBeInTheDocument();
    });
  });
});
