import userEvent from "@testing-library/user-event";

import { getIcon, queryIcon, screen, waitFor, within } from "__support__/ui";
import {
  createMockActionParameter,
  createMockCard,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { setup } from "./common";

describe("ActionCreator > Query Actions", () => {
  describe("New Action", () => {
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
      await userEvent.click(getIcon("reference"));

      expect(screen.getAllByText("Data Reference")).toHaveLength(2);
      expect(
        within(screen.getByTestId("sidebar-content")).getByText("Database"),
      ).toBeInTheDocument();
    });

    it("should show action settings button", async () => {
      await setup();
      expect(
        screen.getByRole("button", { name: "Action settings" }),
      ).toBeInTheDocument();
    });

    it("should disable 'make public' switch in new action modal and show an explanatory tooltip (metabase#51282)", async () => {
      await setup({
        isAdmin: true,
        isPublicSharingEnabled: true,
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Action settings" }),
      );
      await userEvent.tab(); // move focus away from "Action settings" button to hide its tooltip
      await waitFor(
        () => {
          expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      const makePublic = screen.getByRole("switch", {
        name: "Make public",
      });
      expect(makePublic).toBeDisabled();
      expect(makePublic).not.toBeChecked();
      await userEvent.hover(makePublic);
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "To enable creating a shareable link you first need to save your action",
      );
    });

    describe("Save Modal", () => {
      it("should show default message in model picker", async () => {
        await setup({ model: null });

        // put query into textbox
        const view = screen.getByTestId("mock-native-query-editor");
        await userEvent.click(within(view).getByRole("textbox"));
        await userEvent.paste("select * from orders where {{paramNane}}");

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        // form is rendered
        expect(
          await screen.findByPlaceholderText("My new fantastic action"),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId("collection-picker-button"),
        ).toHaveTextContent("Select a model");
      });

      it("should preselect model", async () => {
        const MODEL_NAME = "Awesome Model";
        const model = createMockCard({
          type: "model",
          can_write: true,
          name: MODEL_NAME,
        });
        await setup({ model });

        // put query into textbox
        const view = screen.getByTestId("mock-native-query-editor");
        await userEvent.click(within(view).getByRole("textbox"));
        await userEvent.paste("select * from orders where {{paramNane}}");

        await userEvent.click(
          await screen.findByRole("button", { name: "Save" }),
        );

        // form is rendered
        expect(
          await screen.findByPlaceholderText("My new fantastic action"),
        ).toBeInTheDocument();
        // model is preselected
        await waitFor(() =>
          expect(
            screen.getByTestId("collection-picker-button"),
          ).toHaveTextContent(MODEL_NAME),
        );
      });
    });
  });

  describe("Editing Action", () => {
    it("renders correctly", async () => {
      const action = createMockQueryAction();
      await setup({ action });

      await waitFor(() => {
        expect(screen.getByText(action.name)).toBeInTheDocument();
      });
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

      await waitFor(() => {
        expect(screen.getAllByText("FooBar")).toHaveLength(2);
      });
    });

    it("blocks editing if the user doesn't have write permissions for the collection", async () => {
      const action = createMockQueryAction({
        parameters: [createMockActionParameter({ name: "FooBar" })],
      });
      await setup({ action, canWrite: false });

      await waitFor(() => {
        expect(screen.getByDisplayValue(action.name)).toBeDisabled();
      });
      expect(queryIcon("grabber")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Field settings")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update" }),
      ).not.toBeInTheDocument();

      screen.getByLabelText("Action settings").click();

      expect(await screen.findByLabelText("Success message")).toBeDisabled();
    });

    it("blocks editing if actions are disabled for the database", async () => {
      const action = createMockQueryAction({
        parameters: [createMockActionParameter({ name: "FooBar" })],
      });
      await setup({ action, hasActionsEnabled: false });

      await waitFor(() => {
        expect(screen.getByDisplayValue(action.name)).toBeDisabled();
      });
      expect(queryIcon("grabber")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Field settings")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update" }),
      ).not.toBeInTheDocument();

      screen.getByLabelText("Action settings").click();

      expect(await screen.findByLabelText("Success message")).toBeDisabled();
    });
  });
});
