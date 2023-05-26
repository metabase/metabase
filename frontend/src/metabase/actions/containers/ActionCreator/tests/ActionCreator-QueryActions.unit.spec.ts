import { screen, getIcon, queryIcon } from "__support__/ui";

import {
  createMockActionParameter,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { setup } from "./common";

describe("ActionCreator > Query Actions", () => {
  describe("new action", () => {
    it("renders correctly", async () => {
      await setup();

      expect(screen.getByText(/New action/i)).toBeInTheDocument();
      expect(
        screen.getByTestId("mock-native-query-editor"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("should disable submit by default", async () => {
      await setup();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    });

    it("should show clickable data reference icon", async () => {
      await setup();
      getIcon("reference", "button").click();

      expect(screen.getByText("Data Reference")).toBeInTheDocument();
      expect(screen.getByText("Database")).toBeInTheDocument();
    });

    it("should show action settings button", async () => {
      await setup();
      expect(
        screen.getByRole("button", { name: "Action settings" }),
      ).toBeInTheDocument();
    });
  });

  describe("editing action", () => {
    it("renders correctly", async () => {
      const action = createMockQueryAction();
      await setup({ action });

      expect(screen.getByText(action.name)).toBeInTheDocument();
      expect(screen.queryByText(/New action/i)).not.toBeInTheDocument();
      expect(
        screen.getByTestId("mock-native-query-editor"),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole("button", { name: "Update" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Create" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("renders parameters", async () => {
      await setup({
        action: createMockQueryAction({
          parameters: [createMockActionParameter({ name: "FooBar" })],
        }),
      });

      expect(screen.getAllByText("FooBar")).toHaveLength(2);
    });

    it("blocks editing if the user doesn't have write permissions for the collection", async () => {
      const action = createMockQueryAction({
        parameters: [createMockActionParameter({ name: "FooBar" })],
      });
      await setup({ action, canWrite: false });

      expect(screen.getByDisplayValue(action.name)).toBeDisabled();
      expect(queryIcon("grabber")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Field settings")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update" }),
      ).not.toBeInTheDocument();

      screen.getByLabelText("Action settings").click();

      expect(screen.getByLabelText("Success message")).toBeDisabled();
    });

    it("blocks editing if actions are disabled for the database", async () => {
      const action = createMockQueryAction({
        parameters: [createMockActionParameter({ name: "FooBar" })],
      });
      await setup({ action, hasActionsEnabled: false });

      expect(screen.getByDisplayValue(action.name)).toBeDisabled();
      expect(queryIcon("grabber")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Field settings")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update" }),
      ).not.toBeInTheDocument();

      screen.getByLabelText("Action settings").click();

      expect(screen.getByLabelText("Success message")).toBeDisabled();
    });
  });
});
