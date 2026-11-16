import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupActionsEndpoints } from "__support__/server-mocks";
import {
  fireEvent,
  getIcon,
  queryIcon,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { WritebackAction } from "metabase-types/api";
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

    it("doesn't let non-admins create an action", async () => {
      await setup({ isAdmin: false });

      expect(screen.getByText(/New action/i)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });

    it("should disable submit by default", async () => {
      await setup();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    });

    it("should show clickable data reference icon", async () => {
      await setup();
      await userEvent.click(getIcon("reference"));

      await waitFor(() =>
        expect(screen.getAllByText("Data Reference")).toHaveLength(2),
      );
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

    it("turns only variable template tags into parameters and keeps them when the window is resized (metabase#32750)", async () => {
      await setup();

      const editor = within(
        screen.getByTestId("mock-native-query-editor"),
      ).getByRole("textbox");
      const query = "{{#1-orders-model}} {{snippet:101}} {{id}}";
      fireEvent.change(editor, { target: { value: query } });

      expect(await screen.findByLabelText("ID")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("#1 Orders Model"),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Snippet:101")).not.toBeInTheDocument();
      expect(screen.getAllByTestId("form-field-container")).toHaveLength(1);

      const initialWidth = window.innerWidth;
      for (const width of [320, 1440]) {
        window.innerWidth = width;
        fireEvent(window, new Event("resize"));

        expect(screen.getByTestId("action-creator")).toBeInTheDocument();
        expect(editor).toHaveValue(query);
        expect(screen.getByLabelText("ID")).toBeInTheDocument();
      }
      window.innerWidth = initialWidth;
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

    it("creates the action with the name given in the save form and closes the editor", async () => {
      const model = createMockCard({ type: "model", can_write: true });
      const onSubmit = jest.fn<void, [WritebackAction]>();
      const onClose = jest.fn<void, []>();
      setupActionsEndpoints([]);
      await setup({ model, onSubmit, onClose });

      const view = screen.getByTestId("mock-native-query-editor");
      await userEvent.click(within(view).getByRole("textbox"));
      await userEvent.paste("DELETE FROM orders WHERE id = {{ id }}");
      await userEvent.click(
        await screen.findByRole("radio", { name: "Number" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await userEvent.type(
        await screen.findByPlaceholderText("My new fantastic action"),
        "Delete Order",
      );
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      const [createCall] = fetchMock.callHistory.calls("path:/api/action", {
        method: "POST",
      });
      const body: unknown = JSON.parse(String(createCall.options.body));
      expect(body).toMatchObject({
        name: "Delete Order",
        type: "query",
        model_id: model.id,
      });
      expect(getFieldSettingsList(body)).toEqual([
        expect.objectContaining({ fieldType: "number", inputType: "number" }),
      ]);
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe("Editing Action", () => {
    it("updates the action and closes the editor", async () => {
      const action = createMockQueryAction({
        dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
          query: "DELETE FROM orders WHERE id = {{ id }}",
        }),
      });
      const onClose = jest.fn<void, []>();
      await setup({ action, onClose });

      await userEvent.click(await screen.findByLabelText("Show field"));
      const view = screen.getByTestId("mock-native-query-editor");
      await userEvent.type(
        within(view).getByRole("textbox"),
        " AND status = 'pending'",
      );
      await userEvent.click(
        await screen.findByRole("button", { name: "Update" }),
      );

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      const putCalls = fetchMock.callHistory.calls(
        `path:/api/action/${action.id}`,
        { method: "PUT" },
      );
      expect(putCalls).toHaveLength(1);
      const body: unknown = JSON.parse(String(putCalls[0].options.body));
      expect(body).toMatchObject({
        dataset_query: {
          stages: [
            {
              native:
                "DELETE FROM orders WHERE id = {{ id }} AND status = 'pending'",
            },
          ],
        },
      });
      expect(getFieldSettingsList(body)).toEqual([
        expect.objectContaining({ hidden: true }),
      ]);
    });

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

      await userEvent.click(screen.getByLabelText("Action settings"));

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

      await userEvent.click(screen.getByLabelText("Action settings"));

      expect(await screen.findByLabelText("Success message")).toBeDisabled();
    });
  });
});

function getFieldSettingsList(requestBody: unknown): unknown[] {
  if (
    typeof requestBody !== "object" ||
    requestBody === null ||
    !("visualization_settings" in requestBody)
  ) {
    return [];
  }
  const settings = requestBody.visualization_settings;
  if (
    typeof settings !== "object" ||
    settings === null ||
    !("fields" in settings)
  ) {
    return [];
  }
  const { fields } = settings;
  return typeof fields === "object" && fields !== null
    ? Object.values(fields)
    : [];
}
