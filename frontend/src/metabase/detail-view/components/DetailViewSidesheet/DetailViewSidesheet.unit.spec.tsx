import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionsEndpoints,
  setupDatabasesEndpoints,
  setupExecuteActionEndpoint,
  setupPrefetchActionValuesEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { getNextId, waitForRequestsToSettle } from "__support__/utils";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { WritebackAction } from "metabase-types/api";
import {
  createMockActionParameter,
  createMockColumn,
  createMockDatabase,
  createMockField,
  createMockImplicitQueryAction,
  createMockTable,
} from "metabase-types/api/mocks";

import { DetailViewSidesheet } from "./DetailViewSidesheet";

const modelId = getNextId();
const database = createMockDatabase({
  id: getNextId(),
  settings: { "database-enable-actions": true },
});
const updateAction = createMockImplicitQueryAction({
  id: getNextId(),
  database_id: database.id,
  kind: "row/update",
  name: "Update",
  parameters: [
    createMockActionParameter({
      id: "id",
      "display-name": "ID",
      type: "type/Integer",
    }),
    createMockActionParameter({
      id: "team_name",
      "display-name": "Team Name",
      type: "type/Text",
    }),
  ],
});
const deleteAction = createMockImplicitQueryAction({
  id: getNextId(),
  database_id: database.id,
  kind: "row/delete",
  name: "Delete",
  parameters: [
    createMockActionParameter({
      id: "id",
      "display-name": "ID",
      type: "type/Integer",
    }),
  ],
});
const idFieldId = getNextId();
const idField = createMockField({
  id: idFieldId,
  name: "ID",
  display_name: "ID",
  semantic_type: "type/PK",
});
const idColumn = createMockColumn({
  id: idFieldId,
  name: "ID",
  display_name: "ID",
  semantic_type: "type/PK",
});
const ROW_ID = 11;
const table = createMockTable({
  fields: [idField],
});

type SetupOpts = {
  showNav?: boolean;
  actions?: WritebackAction[];
};

function setup({ showNav = true, actions = [updateAction] }: SetupOpts = {}) {
  const onNextClick = jest.fn();
  const onPreviousClick = jest.fn();
  const onActionSuccess = jest.fn();
  const onClose = jest.fn();

  setupDatabasesEndpoints([database]);
  setupActionsEndpoints(actions);

  renderWithProviders(
    <>
      <DetailViewSidesheet
        columnSettings={undefined}
        columns={[idColumn]}
        columnsSettings={[undefined]}
        query={undefined}
        row={[ROW_ID]}
        rowId={ROW_ID}
        modelId={modelId}
        showImplicitActions
        showNav={showNav}
        table={table}
        tableForeignKeys={[]}
        url="/model/1-model/detail/1"
        onActionSuccess={onActionSuccess}
        onClose={onClose}
        onNextClick={onNextClick}
        onPreviousClick={onPreviousClick}
      />
      <UndoListing />
    </>,
  );

  return { onNextClick, onPreviousClick, onActionSuccess, onClose };
}

function getRequestBody(url: string): unknown {
  const [call] = fetchMock.callHistory.calls(url, { method: "POST" });
  return JSON.parse(String(call.options.body));
}

async function openActionFromMenu(name: string) {
  await userEvent.click(await screen.findByTestId("actions-menu"));
  await userEvent.click(await screen.findByRole("menuitem", { name }));
}

async function openUpdateModal() {
  await openActionFromMenu("Update");
  const modal = await screen.findByTestId("action-execute-modal");
  await waitForLoaderToBeRemoved();
  return modal;
}

describe("DetailViewSidesheet", () => {
  it("navigates rows with arrow keys when keyboard navigation is enabled", async () => {
    const { onNextClick, onPreviousClick } = setup();
    // `ActionExecuteModal` initialises its values state after this render,
    // with nothing observable to wait on, so flush that update here.
    await waitForRequestsToSettle();

    fireEvent.keyDown(document.documentElement, { key: "ArrowUp" });
    expect(onPreviousClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.documentElement, { key: "ArrowDown" });
    expect(onNextClick).toHaveBeenCalledTimes(1);
  });

  it("does not navigate rows with arrow keys when keyboard navigation is disabled", async () => {
    const { onNextClick, onPreviousClick } = setup({ showNav: false });
    await waitForRequestsToSettle();

    fireEvent.keyDown(document.documentElement, { key: "ArrowUp" });
    expect(onPreviousClick).not.toHaveBeenCalled();

    fireEvent.keyDown(document.documentElement, { key: "ArrowDown" });
    expect(onNextClick).not.toHaveBeenCalled();
  });

  it("does not navigate rows when using arrow keys immediately after opening the actions menu", async () => {
    const { onNextClick } = setup();

    fireEvent.keyDown(document.documentElement, { key: "ArrowDown" });
    expect(onNextClick).toHaveBeenCalledTimes(1);

    const actionsMenu = await screen.findByTestId("actions-menu");
    fireEvent.click(actionsMenu);
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });

    expect(onNextClick).toHaveBeenCalledTimes(1);
  });

  describe("implicit actions", () => {
    it("does not show the actions menu when the model has no implicit actions", async () => {
      setup({ actions: [] });
      await waitForRequestsToSettle();

      expect(screen.getByTestId("object-detail")).toBeInTheDocument();
      expect(screen.queryByTestId("actions-menu")).not.toBeInTheDocument();
    });

    it("shows the update and delete actions when implicit actions exist", async () => {
      setup({ actions: [updateAction, deleteAction] });

      await userEvent.click(await screen.findByTestId("actions-menu"));

      expect(
        await screen.findByRole("menuitem", { name: "Update" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: "Delete" }),
      ).toBeInTheDocument();
    });

    it("closes only the action modal, not the object detail, on Escape", async () => {
      setupPrefetchActionValuesEndpoint(updateAction.id, { id: ROW_ID });
      const { onClose } = setup();

      await openUpdateModal();
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(
          screen.queryByTestId("action-execute-modal"),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByTestId("object-detail")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("prefills the update form with the row values", async () => {
      setupPrefetchActionValuesEndpoint(updateAction.id, {
        id: ROW_ID,
        team_name: "Kind Koalas",
      });
      setup();

      const modal = await openUpdateModal();

      await waitFor(() => {
        expect(within(modal).getByLabelText("Team Name")).toHaveValue(
          "Kind Koalas",
        );
      });
      expect(within(modal).getByLabelText("ID")).toHaveValue(String(ROW_ID));
      expect(
        getRequestBody(`path:/api/action/${updateAction.id}/execute/values`),
      ).toEqual({ parameters: { id: String(ROW_ID) } });
    });

    it("shows field and form errors when the update violates a constraint", async () => {
      setupPrefetchActionValuesEndpoint(updateAction.id, {
        id: ROW_ID,
        team_name: "Kind Koalas",
      });
      setupExecuteActionEndpoint(updateAction.id, {
        status: 400,
        body: {
          message: "Team_name already exists.",
          errors: { team_name: "This Team_name value already exists." },
        },
      });
      const { onActionSuccess } = setup();

      const modal = await openUpdateModal();
      const teamNameInput = await within(modal).findByLabelText("Team Name");
      await waitFor(() => expect(teamNameInput).toHaveValue("Kind Koalas"));
      await userEvent.clear(teamNameInput);
      await userEvent.type(teamNameInput, "Dusty Ducks");
      await userEvent.click(
        within(modal).getByRole("button", { name: "Update" }),
      );

      expect(
        await within(modal).findByText("This Team_name value already exists."),
      ).toBeInTheDocument();
      expect(
        within(modal).getByText("Team_name already exists."),
      ).toBeInTheDocument();
      expect(within(modal).getByLabelText("Team Name")).toBeInTheDocument();
      expect(onActionSuccess).not.toHaveBeenCalled();
    });

    it("shows a success toast after updating a row", async () => {
      setupPrefetchActionValuesEndpoint(updateAction.id, {
        id: ROW_ID,
        team_name: "Kind Koalas",
      });
      setupExecuteActionEndpoint(updateAction.id, {
        body: { "rows-updated": [1] },
      });
      const { onActionSuccess, onClose } = setup();

      const modal = await openUpdateModal();
      const teamNameInput = await within(modal).findByLabelText("Team Name");
      await waitFor(() => expect(teamNameInput).toHaveValue("Kind Koalas"));
      await userEvent.clear(teamNameInput);
      await userEvent.type(teamNameInput, "Dusty Ducks");
      await userEvent.click(
        within(modal).getByRole("button", { name: "Update" }),
      );

      expect(
        await screen.findByText("Successfully updated"),
      ).toBeInTheDocument();
      expect(
        getRequestBody(`path:/api/action/${updateAction.id}/execute`),
      ).toMatchObject({
        parameters: { id: String(ROW_ID), team_name: "Dusty Ducks" },
      });
      expect(onActionSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(
          screen.queryByTestId("action-execute-modal"),
        ).not.toBeInTheDocument();
      });
    });

    it("shows a success toast and closes the object detail after deleting a row", async () => {
      setupExecuteActionEndpoint(deleteAction.id, {
        body: { "rows-deleted": [1] },
      });
      const { onActionSuccess, onClose } = setup({
        actions: [updateAction, deleteAction],
      });

      await openActionFromMenu("Delete");
      const modal = await screen.findByTestId("delete-object-modal");
      await userEvent.click(
        within(modal).getByRole("button", { name: "Delete forever" }),
      );

      expect(
        await screen.findByText("Successfully deleted"),
      ).toBeInTheDocument();
      expect(
        getRequestBody(`path:/api/action/${deleteAction.id}/execute`),
      ).toEqual({ parameters: { id: ROW_ID } });
      expect(onActionSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
