import { screen } from "__support__/ui";

import { setupQuestionSharingMenu, openMenu } from "./setup";

describe("QuestionSharingMenu", () => {
  it("should not render anything if the question is a model", async () => {
    setupQuestionSharingMenu({
      question: { type: "model" },
    });
    expect(screen.queryByTestId("sharing-menu-button")).not.toBeInTheDocument();
  });

  describe("public links", () => {
    describe("admins", () => {
      it('should show a "Create Public link" menu item if public sharing is enabled', async () => {
        setupQuestionSharingMenu({
          isAdmin: true,
          isPublicSharingEnabled: true,
        });
        await openMenu();
        expect(screen.getByText("Create a public link")).toBeInTheDocument();
      });

      it('should show a "Public link" menu item if public sharing is enabled and a public link exists already', async () => {
        setupQuestionSharingMenu({
          isAdmin: true,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        expect(screen.getByText("Public link")).toBeInTheDocument();
        expect(
          screen.queryByText("Create a public link"),
        ).not.toBeInTheDocument();
      });

      it("should show a 'public links are off' menu item if public sharing is disabled", async () => {
        setupQuestionSharingMenu({
          isAdmin: true,
          isPublicSharingEnabled: false,
        });
        await openMenu();
        expect(screen.getByText("Public links are off")).toBeInTheDocument();
        expect(
          screen.queryByText("Create a public link"),
        ).not.toBeInTheDocument();
      });

      // note: if public sharing is disabled, the dashboard object provided by the backend should not have a UUID
    });

    describe("non-admins", () => {
      it('should show a "Public link" button item if public sharing is enabled and a public link exists already', async () => {
        setupQuestionSharingMenu({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        const sharingButton = screen.getByTestId("sharing-menu-button");

        expect(sharingButton).toBeEnabled();
        expect(sharingButton).toHaveAttribute("aria-label", "Public link");
      });

      it("should show a 'ask your admin to create a public link' menu item if public sharing is disabled", async () => {
        setupQuestionSharingMenu({
          isAdmin: false,
          isPublicSharingEnabled: false,
          hasPublicLink: true,
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
          isAdmin: false,
          isPublicSharingEnabled: true,
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

  describe("embedding", () => {
    describe("admins", () => {
      it("should show the 'Embed' menu item if embedding is enabled", async () => {
        setupQuestionSharingMenu({
          isAdmin: true,
          isEmbeddingEnabled: true,
        });
        await openMenu();
        expect(screen.getByText("Embed")).toBeInTheDocument();
      });

      it("should show an 'embedding is off' menu item if embedding is disabled", async () => {
        setupQuestionSharingMenu({
          isAdmin: true,
          isEmbeddingEnabled: false,
        });
        await openMenu();
        expect(screen.getByText("Embedding is off")).toBeInTheDocument();
      });
    });

    describe("non-admins", () => {
      it("should not show the 'Embed' menu item if embedding is enabled", async () => {
        setupQuestionSharingMenu({
          isAdmin: false,
          isEmbeddingEnabled: true,
        });
        await openMenu();
        expect(screen.queryByText("Embed")).not.toBeInTheDocument();
      });

      it("should not show the 'Embed' menu item if embedding is disabled", async () => {
        setupQuestionSharingMenu({
          isAdmin: false,
          isEmbeddingEnabled: false,
        });
        await openMenu();
        expect(screen.queryByText("Embed")).not.toBeInTheDocument();
      });
    });
  });
});
