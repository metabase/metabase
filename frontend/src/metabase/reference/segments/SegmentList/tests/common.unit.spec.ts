import { screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("SegmentList (OSS)", () => {
  describe("Admins", () => {
    const adminUser = createMockUser({
      is_superuser: true,
    });

    it("should render help link when `show-metabase-links: true`", () => {
      setup({ user: adminUser, showMetabaseLinks: true });

      expect(
        screen.getByText("Segments are interesting subsets of tables"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Learn how to create segments"),
      ).toBeInTheDocument();
    });

    it("should render help link when `show-metabase-links: false`", () => {
      setup({ user: adminUser, showMetabaseLinks: false });

      expect(
        screen.getByText("Segments are interesting subsets of tables"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Learn how to create segments"),
      ).toBeInTheDocument();
    });
  });

  describe("Non-admins", () => {
    const user = createMockUser();
    it("should not render help link", () => {
      setup({ user });

      expect(
        screen.getByText("Segments are interesting subsets of tables"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Learn how to create segments"),
      ).not.toBeInTheDocument();
    });
  });
});
