import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { createMockAlert } from "metabase-types/api/mocks";

import { openMenu, setupQuestionSharingMenu } from "./setup";

describe("QuestionSharingMenu", () => {
  it("should not render anything if the question is a model", async () => {
    setupQuestionSharingMenu({
      question: { type: "model" },
    });
    expect(
      screen.queryByTestId("notifications-menu-button"),
    ).not.toBeInTheDocument();
  });

  it("should have a 'Notifications' tooltip by default", () => {
    setupQuestionSharingMenu({
      isAdmin: true,
    });
    expect(screen.getByTestId("notifications-menu-button")).toHaveAttribute(
      "aria-label",
      "Notifications",
    );
  });

  it("should not appear for archived questions", async () => {
    setupQuestionSharingMenu({
      isAdmin: true,
      question: { archived: true },
    });

    expect(
      screen.queryByTestId("notifications-menu-button"),
    ).not.toBeInTheDocument();
  });

  it("should prompt you to save an unsaved question", async () => {
    setupQuestionSharingMenu({
      isAdmin: true,
      question: { id: undefined },
    });

    expect(screen.getByTestId("notifications-menu-button")).toHaveAttribute(
      "aria-label",
      "You must save this question before creating an alert",
    );
  });

  describe("alerts", () => {
    describe("admins", () => {
      it("should show the 'Create alerts' menu item if no alerts exist", async () => {
        setupQuestionSharingMenu({
          isAdmin: true,
          isEmailSetup: true,
          alerts: [],
        });
        await openMenu();
        expect(screen.getByText("Create alerts")).toBeInTheDocument();
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
      it("should show the 'Create alerts' menu item if no alerts exist", async () => {
        setupQuestionSharingMenu({
          isAdmin: false,
          isEmailSetup: true,
          alerts: [],
        });
        await openMenu();
        expect(screen.getByText("Create alerts")).toBeInTheDocument();
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
});
