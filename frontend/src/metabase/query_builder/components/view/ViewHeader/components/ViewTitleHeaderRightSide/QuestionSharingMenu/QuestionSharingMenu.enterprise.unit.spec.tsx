import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { openMenu, setupQuestionSharingMenu } from "./tests/setup";

// Under the fast-test regime, userEvent's direct APIs run through
// `userEvent.setup()`, which attaches its own `navigator.clipboard` stub on the
// first interaction, replacing the global jest.fn. Spy on whatever
// `navigator.clipboard` currently exposes once an interaction has put the stub
// in place, and assert on that spy so the exact copied URL is still verified.
function spyOnClipboardWriteText() {
  return jest.spyOn(navigator.clipboard, "writeText");
}

describe("QuestionSharingMenu > Enterprise", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("non-admins", () => {
    it("shows a sharing menu with both copy options when a public link exists", async () => {
      setupQuestionSharingMenu({
        canManageSubscriptions: false,
        isPublicSharingEnabled: true,
        hasPublicLink: true,
        isEnterprise: true,
      });
      expect(screen.getByTestId("sharing-menu-button")).toHaveAttribute(
        "aria-label",
        "Share",
      );
      await openMenu();
      expect(screen.getByText("Copy link")).toBeInTheDocument();
      expect(screen.getByText("Copy public link")).toBeInTheDocument();
    });

    it("copies the public link from the menu instead of opening a popover", async () => {
      setupQuestionSharingMenu({
        canManageSubscriptions: false,
        isPublicSharingEnabled: true,
        hasPublicLink: true,
        isEnterprise: true,
      });

      await openMenu();
      const writeText = spyOnClipboardWriteText();
      await userEvent.click(screen.getByText("Copy public link"));

      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(
          "http://localhost:3000/public/question/1337bad801",
        ),
      );
      expect(
        screen.queryByTestId("public-link-popover-content"),
      ).not.toBeInTheDocument();
    });

    it("copies the app link directly without an admin prompt when public sharing is disabled", async () => {
      setupQuestionSharingMenu({
        isPublicSharingEnabled: false,
        hasPublicLink: true,
        canManageSubscriptions: false,
        isEnterprise: true,
      });
      const sharingButton = screen.getByTestId("sharing-menu-button");

      expect(sharingButton).toHaveAttribute("aria-label", "Copy link");
      await userEvent.hover(sharingButton);
      const writeText = spyOnClipboardWriteText();
      await userEvent.click(sharingButton);

      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(
          "http://localhost:3000/question/1-my-cool-question",
        ),
      );
      expect(
        screen.queryByText("Ask your admin to create a public link"),
      ).not.toBeInTheDocument();
    });

    it("copies the app link directly without an admin prompt when there is no public link", async () => {
      setupQuestionSharingMenu({
        isPublicSharingEnabled: true,
        canManageSubscriptions: false,
        hasPublicLink: false,
      });
      const sharingButton = screen.getByTestId("sharing-menu-button");

      expect(sharingButton).toHaveAttribute("aria-label", "Copy link");
      await userEvent.hover(sharingButton);
      const writeText = spyOnClipboardWriteText();
      await userEvent.click(sharingButton);

      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(
          "http://localhost:3000/question/1-my-cool-question",
        ),
      );
      expect(
        screen.queryByText("Ask your admin to create a public link"),
      ).not.toBeInTheDocument();
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
