import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockModerationReview,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import {
  EntityModerationIcon,
  type EntityModerationIconProps,
} from "./EntityModerationIcon";

const setup = (props: EntityModerationIconProps) => {
  const storeInitialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        content_verification: true,
      }),
    }),
  });

  setupEnterprisePlugins();

  renderWithProviders(<EntityModerationIcon {...props} />, {
    storeInitialState,
  });
};

describe("EntityModerationIcon", () => {
  describe("questions", () => {
    it("verified question", () => {
      setup({
        moderationReviews: [createMockModerationReview()],
      });

      expect(screen.getByRole("img", { name: /verified/ })).toBeInTheDocument();
    });

    it("not verified question", () => {
      setup({
        moderationReviews: [
          createMockModerationReview({
            status: null,
          }),
        ],
      });

      expect(
        screen.queryByRole("img", { name: /verified/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("dashboards", () => {
    it("verified dashboard", () => {
      setup({
        moderationReviews: [createMockModerationReview()],
      });

      expect(screen.getByRole("img", { name: /verified/ })).toBeInTheDocument();
    });

    it("not verified dashboard", () => {
      setup({
        moderationReviews: [
          createMockModerationReview({
            status: null,
          }),
        ],
      });

      expect(
        screen.queryByRole("img", { name: /verified/ }),
      ).not.toBeInTheDocument();
    });
  });
});
