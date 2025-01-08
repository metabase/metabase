import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { createMockAlert } from "metabase-types/api/mocks";

import { setupQuestionSharingMenu, waitForAlertsListLoaded } from "./setup";

describe("QuestionSharingMenu", () => {
  it("should not render anything if the question is a model", () => {
    setupQuestionSharingMenu({
      question: { type: "model" },
    });

    expect(
      screen.queryByTestId("notifications-menu-button"),
    ).not.toBeInTheDocument();
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
      it("should show the 'Create an alert' menu item if no alerts exist", async () => {
        const { cardId } = setupQuestionSharingMenu({
          isAdmin: true,
          isEmailSetup: true,
          alerts: [],
        });

        await waitForAlertsListLoaded(cardId);

        expect(screen.getByLabelText("Create an alert")).toBeInTheDocument();
      });

      it("should show the 'Edit alerts' menu item if alerts exist", async () => {
        const { cardId } = setupQuestionSharingMenu({
          isAdmin: true,
          isEmailSetup: true,
          alerts: [createMockAlert()],
        });

        await waitForAlertsListLoaded(cardId);

        expect(screen.getByLabelText("Edit alerts")).toBeInTheDocument();
      });

      it("clicking to edit alerts should open the alert popover", async () => {
        const { cardId } = setupQuestionSharingMenu({
          isAdmin: true,
          isEmailSetup: true,
          alerts: [createMockAlert()],
        });

        await waitForAlertsListLoaded(cardId);

        await userEvent.click(screen.getByLabelText("Edit alerts"));
        expect(
          await screen.findByTestId("alert-list-popover"),
        ).toBeInTheDocument();
      });
    });

    describe("non-admins", () => {
      it("should show the 'Create an alert' menu item if no alerts exist", async () => {
        const { cardId } = setupQuestionSharingMenu({
          isAdmin: false,
          isEmailSetup: true,
          alerts: [],
        });

        await waitForAlertsListLoaded(cardId);

        expect(screen.getByLabelText("Create an alert")).toBeInTheDocument();
      });

      it("should show the 'Edit alerts' menu item if alerts exist", async () => {
        const { cardId } = setupQuestionSharingMenu({
          isAdmin: false,
          isEmailSetup: true,
          alerts: [createMockAlert()],
        });

        await waitForAlertsListLoaded(cardId);

        expect(screen.getByLabelText("Edit alerts")).toBeInTheDocument();
      });

      it("clicking to edit alerts should open the alert popover", async () => {
        const { cardId } = setupQuestionSharingMenu({
          isAdmin: false,
          isEmailSetup: true,
          alerts: [createMockAlert()],
        });

        await waitForAlertsListLoaded(cardId);

        await userEvent.click(screen.getByLabelText("Edit alerts"));
        expect(
          await screen.findByTestId("alert-list-popover"),
        ).toBeInTheDocument();
      });
    });
  });
});
