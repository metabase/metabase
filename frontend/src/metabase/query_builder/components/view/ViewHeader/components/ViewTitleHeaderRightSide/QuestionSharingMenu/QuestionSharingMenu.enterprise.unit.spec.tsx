import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { setupQuestionSharingMenu } from "./tests/setup";

describe("QuestionSharingMenu > Enterprise", () => {
  describe("non-admins", () => {
    describe("alerts permission disabled", () => {
      it('should show a "Public link" button item if public sharing is enabled and the user lacks alerts permissions', async () => {
        setupQuestionSharingMenu({
          canManageSubscriptions: false,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
          isEnterprise: true,
        });
        const sharingButton = screen.getByTestId("sharing-menu-button");

        expect(sharingButton).toBeEnabled();
        expect(sharingButton).toHaveAttribute("aria-label", "Public link");
      });

      it("clicking the sharing button should open the public link popover", async () => {
        setupQuestionSharingMenu({
          canManageSubscriptions: false,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
          isEnterprise: true,
        });

        await userEvent.click(screen.getByTestId("sharing-menu-button"));

        // popover content mounts asynchronously after the click
        expect(
          await screen.findByTestId("public-link-popover-content"),
        ).toBeInTheDocument();
        const input = screen.getByTestId("public-link-input");
        expect(input).toHaveDisplayValue(
          "http://localhost:3000/public/question/1337bad801",
        );

        // the input drops its loading placeholder once the link-loading
        // effect resolves
        await waitFor(() => expect(input).not.toHaveAttribute("placeholder"));
      });

      it("should show a 'ask your admin to create a public link' tooltip if public sharing is disabled", async () => {
        setupQuestionSharingMenu({
          isPublicSharingEnabled: false,
          hasPublicLink: true,
          canManageSubscriptions: false,
          isEnterprise: true,
        });
        const sharingButton = screen.getByTestId("sharing-menu-button");

        expect(sharingButton).toBeDisabled();
        expect(sharingButton).toHaveAttribute(
          "aria-label",
          "Ask your admin to create a public link",
        );
      });

      it("should show a 'ask your admin to create a public link' menu item if public sharing is enabled, but there is no existing public link", async () => {
        setupQuestionSharingMenu({
          isPublicSharingEnabled: true,
          canManageSubscriptions: false,
          hasPublicLink: false,
        });
        const sharingButton = screen.getByTestId("sharing-menu-button");

        expect(sharingButton).toBeDisabled();
        expect(sharingButton).toHaveAttribute(
          "aria-label",
          "Ask your admin to create a public link",
        );
      });
    });
  });

  describe("admins", () => {
    it("should not allow sharing instance analytics question", async () => {
      setupQuestionSharingMenu({
        isAdmin: true,
        isPublicSharingEnabled: true,
        isEmbeddingEnabled: true,
        isEnterprise: true,
        question: {
          name: "analysis",
          collection: createMockCollection({
            id: 198,
            name: "Analytics",
            type: "instance-analytics",
          }),
        },
      });
      expect(
        screen.queryByTestId("sharing-menu-button"),
      ).not.toBeInTheDocument();
    });
  });
});
