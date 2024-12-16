import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { createMockAlert } from "metabase-types/api/mocks";

import { openMenu, setupQuestionSharingMenu } from "./setup";

describe("QuestionSharingMenu", () => {
  it("should not render anything if the question is a model", async () => {
    setupQuestionSharingMenu({
      question: { type: "model" },
    });
    expect(screen.queryByTestId("sharing-menu-button")).not.toBeInTheDocument();
  });

  it("should have a 'sharing' tooltip by default", () => {
    setupQuestionSharingMenu({
      isAdmin: true,
    });
    expect(screen.getByTestId("sharing-menu-button")).toHaveAttribute(
      "aria-label",
      "Sharing",
    );
  });

  it("should not appear for archived questions", async () => {
    setupQuestionSharingMenu({
      isAdmin: true,
      question: { archived: true },
    });

    expect(screen.queryByTestId("sharing-menu-button")).not.toBeInTheDocument();
  });

  it("should prompt you to save an unsaved question", async () => {
    setupQuestionSharingMenu({
      isAdmin: true,
      question: { id: undefined },
    });

    expect(screen.getByTestId("sharing-menu-button")).toHaveAttribute(
      "aria-label",
      "You must save this question before sharing",
    );
  });

  describe("alerts", () => {
    describe("admins", () => {
      it("should show the 'Create alert' menu item if no alerts exist", async () => {
        setupQuestionSharingMenu({
          isAdmin: true,
          isEmailSetup: true,
          alerts: [],
        });
        await openMenu();
        expect(screen.getByText("Create alert")).toBeInTheDocument();
      });

      it("should show the 'Edit alerts' menu item if alerts exist", async () => {
        setupQuestionSharingMenu({
          isAdmin: true,
          isEmailSetup: true,
          alerts: [createMockAlert()],
        });
        await openMenu();
        expect(await screen.findByText("Edit alerts")).toBeInTheDocument();
      });

      it("clicking to edit alerts should open the alert popover", async () => {
        setupQuestionSharingMenu({
          isAdmin: true,
          isEmailSetup: true,
          alerts: [createMockAlert()],
        });
        await openMenu();
        await userEvent.click(screen.getByText("Edit alerts"));
        expect(
          await screen.findByTestId("alert-list-popover"),
        ).toBeInTheDocument();
      });
    });

    describe("non-admins", () => {
      it("should show the 'Create alert' menu item if no alerts exist", async () => {
        setupQuestionSharingMenu({
          isAdmin: false,
          isEmailSetup: true,
          alerts: [],
        });
        await openMenu();
        expect(screen.getByText("Create alert")).toBeInTheDocument();
      });

      it("should show the 'Edit alerts' menu item if alerts exist", async () => {
        setupQuestionSharingMenu({
          isAdmin: false,
          isEmailSetup: true,
          alerts: [createMockAlert()],
        });
        await openMenu();
        expect(screen.getByText("Edit alerts")).toBeInTheDocument();
      });

      it("clicking to edit alerts should open the alert popover", async () => {
        setupQuestionSharingMenu({
          isAdmin: false,
          isEmailSetup: true,
          alerts: [createMockAlert()],
        });
        await openMenu();
        await userEvent.click(screen.getByText("Edit alerts"));
        expect(
          await screen.findByTestId("alert-list-popover"),
        ).toBeInTheDocument();
      });
    });
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

      it("clicking the sharing button should open the public link popover", async () => {
        setupQuestionSharingMenu({
          isAdmin: true,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        await userEvent.click(screen.getByText("Public link"));

        expect(
          screen.getByTestId("public-link-popover-content"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("public-link-input")).toHaveDisplayValue(
          "http://localhost:3000/public/question/1337bad801",
        );
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
      it('should show a "Public link" menu item if there is a public link for the question', async () => {
        setupQuestionSharingMenu({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        expect(screen.getByText("Public link")).toBeInTheDocument();
      });

      it('should show an "Ask your admin to create a public link" menu item if there is no public link for the question', async () => {
        setupQuestionSharingMenu({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: false,
        });
        await openMenu();
        expect(
          screen.getByText("Ask your admin to create a public link"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("embedding", () => {
    describe("admins", () => {
      describe("when embedding is disabled", () => {
        it("should open the embed modal when the 'Embed' menu item is clicked", async () => {
          setupQuestionSharingMenu({
            isAdmin: true,
            isEmbeddingEnabled: false,
          });
          await openMenu();
          await userEvent.click(screen.getByText("Embed"));
          expect(await screen.findByText("Embed Metabase")).toBeInTheDocument();
        });
      });

      describe("when embedding is enabled", () => {
        it("should open the embed modal when the 'Embed' menu item is clicked", async () => {
          setupQuestionSharingMenu({
            isAdmin: true,
            isEmbeddingEnabled: true,
          });
          await openMenu();
          await userEvent.click(screen.getByText("Embed"));
          expect(await screen.findByText("Embed Metabase")).toBeInTheDocument();
        });
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
