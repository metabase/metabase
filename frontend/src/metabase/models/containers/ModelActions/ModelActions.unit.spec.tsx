import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupCardsUsingModelEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupExecuteActionEndpoint,
  setupModelActionsEndpoints,
} from "__support__/server-mocks";
import { createMockSettingsState, createMockState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { getDefaultFieldSettings } from "metabase/actions/utils";
import { modalRoute } from "metabase/common/components/ModalRoute";
import { UndoListing } from "metabase/common/components/UndoListing";
import { Outlet, Route, redirect } from "metabase/router";
import * as Urls from "metabase/urls";
import { defer } from "metabase/utils/promise";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { TYPE } from "metabase-lib/v1/types/constants";
import type {
  Card,
  Collection,
  Database,
  ListDatabasesResponse,
  Settings,
  Table,
  WritebackAction,
  WritebackQueryAction,
} from "metabase-types/api";
import {
  createMockQueryAction as _createMockQueryAction,
  createMockActionParameter,
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDatabase,
  createMockField,
  createMockImplicitCUDActions,
  createMockImplicitQueryAction,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import ActionCreatorModal from "../ActionCreatorModal";

import ModelActions from "./ModelActions";

jest.mock("metabase/querying/action-creator", () => ({
  ActionCreator: () => <div data-testid="mock-action-editor" />,
}));

const TEST_DATABASE_ID = 1;
const TEST_TABLE_ID = 1;
const TEST_FIELD = createMockField({
  id: 1,
  display_name: "Field 1",
  semantic_type: TYPE.PK,
  table_id: TEST_TABLE_ID,
});

const TEST_FK_TABLE_1_ID = 2;
const TEST_FK_FIELD_ID = 4;
const TEST_FK_FIELD = createMockField({
  id: TEST_FK_FIELD_ID,
  table_id: TEST_FK_TABLE_1_ID,
});

const TEST_FIELDS = [
  TEST_FIELD,
  createMockField({
    id: 2,
    display_name: "Field 2",
    table_id: TEST_TABLE_ID,
  }),
  createMockField({
    id: 3,
    display_name: "Field 3",
    table_id: TEST_TABLE_ID,
    semantic_type: TYPE.FK,
    fk_target_field_id: TEST_FK_FIELD_ID,
    target: TEST_FK_FIELD,
  }),
];

const TEST_COLUMNS = [
  createMockColumn({
    id: 1,
    display_name: "Field 1",
    semantic_type: TYPE.PK,
    table_id: TEST_TABLE_ID,
  }),
  createMockColumn({
    id: 2,
    display_name: "Field 2",
    table_id: TEST_TABLE_ID,
  }),
  createMockColumn({
    id: 3,
    display_name: "Field 3",
    table_id: TEST_TABLE_ID,
    semantic_type: TYPE.FK,
    fk_target_field_id: TEST_FK_FIELD_ID,
  }),
];

const TEST_TABLE = createMockTable({
  id: TEST_TABLE_ID,
  name: "TEST_TABLE",
  display_name: "TEST_TABLE",
  fields: TEST_FIELDS,
  db_id: TEST_DATABASE_ID,
});

const TEST_FK_TABLE_1 = createMockTable({
  id: TEST_FK_TABLE_1_ID,
  name: "TEST_TABLE points to this",
  fields: [TEST_FK_FIELD],
});

const TEST_DATABASE = createMockDatabase({
  id: TEST_DATABASE_ID,
  name: "Test Database",
  tables: [TEST_TABLE, TEST_FK_TABLE_1],
});

const TEST_PROVIDER = createMetadataProvider({
  databaseId: TEST_DATABASE_ID,
  metadata: createMockMetadata({ databases: [TEST_DATABASE] }),
});

const TEST_DATABASE_WITH_ACTIONS = createMockDatabase({
  ...TEST_DATABASE,
  settings: { "database-enable-actions": true },
});

const TEST_DATABASE_WITH_ACTIONS_READONLY = createMockDatabase({
  ...TEST_DATABASE_WITH_ACTIONS,
  native_permissions: "none",
});

const TEST_DATABASE_WITH_ACTIONS_LIST_ITEM = createMockDatabase({
  ...TEST_DATABASE_WITH_ACTIONS,
  tables: [],
});

function createStructuredModelCard(card?: Partial<Card>) {
  return createMockCard({
    type: "model",
    display: "table",
    can_write: true,
    ...card,
    result_metadata: TEST_COLUMNS,
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(TEST_PROVIDER, {
        stages: [{ source: { type: "table", id: TEST_TABLE_ID } }],
      }),
    ),
  });
}

function createNativeModelCard(card?: Partial<Card>) {
  return createMockCard({
    type: "model",
    display: "table",
    can_write: true,
    ...card,
    result_metadata: TEST_COLUMNS,
    dataset_query: Lib.toJsQuery(
      Lib.createTestNativeQuery(TEST_PROVIDER, {
        query: `SELECT * FROM ${TEST_TABLE.name}`,
      }),
    ),
  });
}

const TEST_QUERY = "UPDATE orders SET status = 'shipped'";

function createMockQueryAction(
  opts?: Partial<WritebackQueryAction>,
): WritebackQueryAction {
  return _createMockQueryAction({
    can_write: true,
    ...opts,
    dataset_query: Lib.toLegacyQuery(
      Lib.createTestNativeQuery(TEST_PROVIDER, { query: TEST_QUERY }),
    ),
  });
}

type SetupOpts = {
  model: Card;
  tab?: string;
  actions?: WritebackAction[];
  databases?: Database[];
  collections?: Collection[];
  usedBy?: Card[];
  settings?: Partial<Settings>;
  deferDatabaseList?: boolean;
  isAdmin?: boolean;
};

async function setup({
  model: card,
  actions = [],
  databases = [TEST_DATABASE],
  collections = [],
  usedBy = [],
  settings = {},
  deferDatabaseList = false,
  isAdmin = true,
}: SetupOpts) {
  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: createMockSettingsState(settings),
  });
  const metadata = createMockMetadata({
    databases: databases,
    tables: [TEST_TABLE, TEST_FK_TABLE_1],
    fields: TEST_FIELDS,
    questions: [card, ...usedBy],
  });

  const model = new Question(card, metadata);
  const usedByQuestions = usedBy.map((q) => new Question(q, metadata));

  const databaseList = defer<ListDatabasesResponse>();
  const mainTable = defer<Table>();
  if (deferDatabaseList) {
    fetchMock.get("path:/api/database", () => databaseList.promise, {
      name: "deferred-database-list",
    });
    fetchMock.get(`path:/api/table/${TEST_TABLE_ID}`, () => mainTable.promise, {
      name: "deferred-main-table",
    });
    fetchMock.get(`path:/api/table/${TEST_TABLE_ID}/fks`, []);
  } else {
    setupDatabasesEndpoints(databases);
  }
  if (databases.length === 0) {
    // The page reads the model's source table to decide whether to load its
    // foreign keys. With no data permissions the server refuses it.
    fetchMock.get(`path:/api/table/${TEST_TABLE_ID}`, 403);
  }
  setupCardsUsingModelEndpoint(card, usedBy);
  setupCardsEndpoints([card]);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases }),
  );
  setupModelActionsEndpoints(actions, model.id());
  setupCollectionsEndpoints({ collections });

  const name = model.displayName()?.toLowerCase();
  const slug = `${model.id()}-${name}`;
  const baseUrl = `/model/${slug}/detail`;

  const { router } = renderWithProviders(
    <Route
      element={
        <>
          <Outlet />
          <UndoListing />
        </>
      }
    >
      <Route path="/model/:slug/detail">
        <Route index element={redirect("actions")} />
        <Route path="actions" element={<ModelActions />}>
          {modalRoute("new", ActionCreatorModal)}
          {modalRoute(":actionId", ActionCreatorModal)}
        </Route>
      </Route>
      <Route path="/question/:slug" element={null} />
    </Route>,
    { withRouter: true, initialRoute: baseUrl, storeInitialState },
  );

  await waitForLoaderToBeRemoved();

  return {
    model,
    router,
    baseUrl,
    metadata,
    usedByQuestions,
    databaseList,
    mainTable,
  };
}

async function setupActions({
  databases = [TEST_DATABASE_WITH_ACTIONS],
  ...opts
}: SetupOpts) {
  return setup({
    databases,
    ...opts,
  });
}

async function openActionMenu(action: WritebackAction) {
  const listItem = screen.getByRole("listitem", { name: action.name });
  const menuButton = within(listItem).getByLabelText("ellipsis icon");
  await userEvent.click(menuButton);
}

async function openHeaderActionsMenu() {
  const header = screen.getByTestId("model-actions-header");
  await userEvent.click(
    within(header).getByRole("button", { name: "Actions" }),
  );
}

describe("ModelActions", () => {
  describe.each([
    { type: "structured", getModel: createStructuredModelCard },
    { type: "native", getModel: createNativeModelCard },
  ])(`$type model`, ({ getModel }) => {
    it("renders and shows name", async () => {
      await setup({
        model: getModel({ name: "My Model" }),
      });

      expect(screen.getByText("My Model")).toBeInTheDocument();
    });

    describe("core actions section", () => {
      it("is shown if actions are enabled for model's database", async () => {
        await setup({
          model: getModel(),
          databases: [TEST_DATABASE_WITH_ACTIONS],
        });
        expect(screen.getByTestId("model-action-details")).toBeInTheDocument();
      });

      it("isn't shown if actions are disabled for model's database", async () => {
        await setup({ model: getModel() });
        expect(
          screen.queryByTestId("model-action-details"),
        ).not.toBeInTheDocument();
      });

      it("is shown if actions are disabled for the model's database but there are existing actions", async () => {
        const model = getModel();
        const action = createMockQueryAction({ model_id: model.id });

        await setup({ model, actions: [action] });

        expect(screen.getByTestId("model-action-details")).toBeInTheDocument();
      });

      it("shows empty state if there are no actions", async () => {
        await setupActions({ model: getModel(), actions: [] });
        expect(
          screen.queryByRole("list", { name: /Action list/i }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByText(/No actions have been created yet/i),
        ).toBeInTheDocument();
      });

      it("shows alert if actions are disabled for the model's database but there are existing actions", async () => {
        const model = getModel();
        const action = createMockQueryAction({ model_id: model.id });

        await setup({ model, actions: [action], tab: "actions" });

        expect(
          screen.getByRole("list", { name: /Action list/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            `Running Actions is not enabled for database ${TEST_DATABASE.name}`,
          ),
        ).toBeInTheDocument();
      });

      it("allows to create a new query action from the empty state", async () => {
        await setupActions({ model: getModel(), actions: [] });
        await userEvent.click(screen.getByRole("link", { name: "New action" }));
        expect(await screen.findByTestId("mock-action-editor")).toBeVisible();
      });

      it("lists existing query actions", async () => {
        const model = getModel();
        const action = createMockQueryAction({ model_id: model.id });
        await setupActions({ model, actions: [action] });

        expect(screen.getByText(action.name)).toBeInTheDocument();
        expect(screen.getByText(TEST_QUERY)).toBeInTheDocument();
        expect(
          screen.getByText(`Created by ${action.creator.common_name}`),
        ).toBeInTheDocument();
        expect(await screen.findByLabelText("Run")).toBeInTheDocument();
        expect(screen.queryByText("Basic action")).not.toBeInTheDocument();
      });

      it("lists existing public query actions with public label", async () => {
        const model = getModel();
        const action = createMockQueryAction({
          model_id: model.id,
          public_uuid: "mock-uuid",
        });
        await setupActions({ model, actions: [action] });

        expect(screen.getByText(action.name)).toBeInTheDocument();
        expect(screen.getByText(TEST_QUERY)).toBeInTheDocument();
        expect(screen.getByText("Public action form")).toBeInTheDocument();
        expect(
          screen.getByText(`Created by ${action.creator.common_name}`),
        ).toBeInTheDocument();
      });

      it("lists existing implicit actions", async () => {
        const model = getModel();
        await setupActions({
          model,
          actions: createMockImplicitCUDActions(model.id),
        });

        expect(screen.getByText("Create")).toBeInTheDocument();
        expect(screen.getByText("Update")).toBeInTheDocument();
        expect(screen.getByText("Delete")).toBeInTheDocument();
        expect(await screen.findAllByLabelText("Run")).toHaveLength(3);
        expect(screen.getAllByText("Basic action")).toHaveLength(3);
      });

      it("allows to create a new query action", async () => {
        const model = getModel();
        await setupActions({
          model,
          actions: [createMockQueryAction({ model_id: model.id })],
        });

        await userEvent.click(screen.getByRole("link", { name: "New action" }));

        expect(await screen.findByTestId("mock-action-editor")).toBeVisible();
      });

      it("allows to edit a query action via link", async () => {
        const model = getModel();
        const action = createMockQueryAction({ model_id: model.id });
        await setupActions({ model, actions: [action] });

        await userEvent.click(screen.getByRole("link", { name: action.name }));

        expect(await screen.findByTestId("mock-action-editor")).toBeVisible();
      });

      it("allows to edit a query action via menu", async () => {
        const model = getModel();
        const action = createMockQueryAction({ model_id: model.id });
        await setupActions({ model, actions: [action] });

        await openActionMenu(action);
        await userEvent.click(await screen.findByText("Edit"));

        expect(await screen.findByTestId("mock-action-editor")).toBeVisible();
      });

      it("allows to delete a query action", async () => {
        const model = getModel();
        const action = createMockQueryAction({ model_id: model.id });
        await setupActions({ model, actions: [action] });

        const listItem = screen.getByRole("listitem", { name: action.name });
        await userEvent.click(within(listItem).getByLabelText("ellipsis icon"));
        await userEvent.click(await screen.findByText("Delete"));

        expect(
          screen.getByRole("heading", { name: /Delete/ }),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() =>
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );

        expect(
          fetchMock.callHistory.calls(`path:/api/action/${action.id}`, {
            method: "DELETE",
          }),
        ).toHaveLength(1);
        expect(
          fetchMock.callHistory.calls(`path:/api/action/${action.id}`, {
            method: "PUT",
          }),
        ).toHaveLength(0);
      });

      it("doesn't allow to delete an implicit action", async () => {
        const model = getModel();
        const action = createMockImplicitQueryAction({
          model_id: model.id,
        });
        await setupActions({ model, actions: [action] });

        await openActionMenu(action);

        expect(screen.queryByText("Delete")).not.toBeInTheDocument();
      });

      it("allows to disable implicit actions", async () => {
        const model = getModel();
        const actions = createMockImplicitCUDActions(model.id);
        await setupActions({ model, actions });

        await openHeaderActionsMenu();
        await userEvent.click(await screen.findByText("Disable basic actions"));
        await userEvent.click(screen.getByRole("button", { name: "Disable" }));

        for (const action of actions) {
          expect(
            fetchMock.callHistory.called(`path:/api/action/${action.id}`, {
              method: "DELETE",
            }),
          ).toBe(true);
        }
      });
    });

    describe("read-only permissions", () => {
      const modelCard = getModel({ can_write: false });

      it("doesn't allow to create actions", async () => {
        await setupActions({ model: modelCard, actions: [] });
        expect(screen.queryByText("New action")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Create basic actions"),
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId("actions-menu")).not.toBeInTheDocument();
      });

      it("doesn't allow to edit actions", async () => {
        const action = createMockQueryAction({
          model_id: modelCard.id,
          can_write: false,
        });
        await setupActions({ model: modelCard, actions: [action] });

        await openActionMenu(action);

        expect(await screen.findByText("View")).toBeInTheDocument();
      });

      it("doesn't allow to delete actions", async () => {
        const action = createMockQueryAction({
          model_id: modelCard.id,
          can_write: false,
        });
        await setupActions({ model: modelCard, actions: [action] });

        await openActionMenu(action);

        expect(screen.queryByText("Delete")).not.toBeInTheDocument();
      });
    });

    describe("non-admin with write permissions on the model", () => {
      const modelCard = getModel();

      it("doesn't allow to create actions", async () => {
        await setupActions({ model: modelCard, actions: [], isAdmin: false });
        expect(screen.queryByText("New action")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Create basic actions"),
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId("actions-menu")).not.toBeInTheDocument();
      });

      it("doesn't allow to edit or delete actions", async () => {
        const action = createMockQueryAction({
          model_id: modelCard.id,
          can_write: false,
        });
        await setupActions({
          model: modelCard,
          actions: [action],
          isAdmin: false,
        });

        await openActionMenu(action);

        expect(await screen.findByText("View")).toBeInTheDocument();
        expect(screen.queryByText("Delete")).not.toBeInTheDocument();
      });
    });

    describe("no data permissions", () => {
      it("doesn't show a new question link", async () => {
        await setup({ model: getModel(), databases: [], tab: "usage" });
        expect(
          screen.queryByText(/Create a new question/i),
        ).not.toBeInTheDocument();
      });

      it("doesn't allow running actions", async () => {
        const model = getModel();
        const actions = [
          ...createMockImplicitCUDActions(model.id),
          createMockQueryAction({ id: 4, model_id: model.id }),
        ];
        await setupActions({ model, actions, databases: [] });

        expect(screen.queryByLabelText("Run")).not.toBeInTheDocument();
      });

      it("doesn't allow to run an action if its database has actions disabled", async () => {
        const action = createMockQueryAction({
          database_id: TEST_DATABASE.id,
        });

        await setupActions({
          model: getModel(),
          databases: [TEST_DATABASE],
          actions: [action],
        });

        expect(screen.queryByLabelText("Run")).not.toBeInTheDocument();
      });

      it("allows to run an action if its database has actions enabled", async () => {
        const action = createMockQueryAction({
          database_id: TEST_DATABASE_WITH_ACTIONS.id,
        });

        await setupActions({
          model: getModel(),
          databases: [TEST_DATABASE_WITH_ACTIONS],
          actions: [action],
        });

        expect(screen.getByLabelText("Run")).toBeInTheDocument();
      });

      it("allows to run an action without native query access", async () => {
        const action = createMockQueryAction({
          database_id: TEST_DATABASE_WITH_ACTIONS_READONLY.id,
        });

        await setupActions({
          model: getModel(),
          databases: [TEST_DATABASE_WITH_ACTIONS_READONLY],
          actions: [action],
        });

        expect(screen.getByLabelText("Run")).toBeInTheDocument();
      });
    });
  });

  describe("structured model", () => {
    const modelCard = createStructuredModelCard();

    it("shows the actions menu when database metadata becomes available after mount", async () => {
      const { databaseList, mainTable } = await setupActions({
        model: modelCard,
        actions: [],
        deferDatabaseList: true,
      });

      const databaseResponse = {
        data: [TEST_DATABASE_WITH_ACTIONS_LIST_ITEM],
        total: 1,
      };

      await waitFor(() => {
        expect(fetchMock.callHistory.called("deferred-database-list")).toBe(
          true,
        );
        expect(fetchMock.callHistory.called("deferred-main-table")).toBe(true);
      });

      await act(async () => {
        databaseList.resolve(databaseResponse);
      });

      try {
        expect(
          await screen.findByRole("button", { name: "Actions" }),
        ).toBeInTheDocument();
      } finally {
        await act(async () => {
          mainTable.resolve(
            createMockTable({
              ...TEST_TABLE,
              fields: [],
            }),
          );
        });
      }
    });

    it("allows to create implicit actions", async () => {
      const action = createMockQueryAction({ model_id: modelCard.id });
      await setupActions({ model: modelCard, actions: [action] });
      fetchMock.modifyRoute("action-post", { response: {} });

      await openHeaderActionsMenu();
      await userEvent.click(await screen.findByText("Create basic actions"));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls("path:/api/action", { method: "POST" }),
        ).toHaveLength(3);
      });
      const createActionCalls = fetchMock.callHistory.calls(
        "path:/api/action",
        {
          method: "POST",
        },
      );

      expect(await createActionCalls[0].request?.json()).toEqual({
        name: "Delete",
        type: "implicit",
        kind: "row/delete",
        model_id: modelCard.id,
      });
      expect(await createActionCalls[1].request?.json()).toEqual({
        name: "Update",
        type: "implicit",
        kind: "row/update",
        model_id: modelCard.id,
      });
      expect(await createActionCalls[2].request?.json()).toEqual({
        name: "Create",
        type: "implicit",
        kind: "row/create",
        model_id: modelCard.id,
      });
    });

    it("allows to create implicit actions from the empty state", async () => {
      await setupActions({ model: modelCard, actions: [] });
      fetchMock.modifyRoute("action-post", { response: {} });

      await userEvent.click(
        screen.getByRole("button", { name: /Create basic action/i }),
      );

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls("path:/api/action", { method: "POST" }),
        ).toHaveLength(3);
      });

      const createActionCalls = fetchMock.callHistory.calls(
        "path:/api/action",
        {
          method: "POST",
        },
      );

      expect(await createActionCalls[0].request?.json()).toEqual({
        name: "Delete",
        type: "implicit",
        kind: "row/delete",
        model_id: modelCard.id,
      });
      expect(await createActionCalls[1].request?.json()).toEqual({
        name: "Update",
        type: "implicit",
        kind: "row/update",
        model_id: modelCard.id,
      });
      expect(await createActionCalls[2].request?.json()).toEqual({
        name: "Create",
        type: "implicit",
        kind: "row/create",
        model_id: modelCard.id,
      });
    });

    it("doesn't allow to create implicit actions when they already exist", async () => {
      await setupActions({
        model: modelCard,
        actions: createMockImplicitCUDActions(modelCard.id),
      });

      await openHeaderActionsMenu();

      expect(
        screen.queryByText(/Create basic action/i),
      ).not.toBeInTheDocument();
    });

    it("doesn't allow to disable implicit actions if they don't exist", async () => {
      await setupActions({ model: modelCard, actions: [] });

      await openHeaderActionsMenu();

      expect(
        screen.queryByText("Disable basic actions"),
      ).not.toBeInTheDocument();
    });
  });

  describe("action list changes", () => {
    const modelCard = createStructuredModelCard();

    it("lists the most recently created actions first", async () => {
      const actions = [
        createMockImplicitQueryAction({
          id: 1,
          name: "Delete",
          kind: "row/delete",
          model_id: modelCard.id,
          created_at: "2024-01-01T00:00:00Z",
        }),
        createMockImplicitQueryAction({
          id: 2,
          name: "Update",
          kind: "row/update",
          model_id: modelCard.id,
          created_at: "2024-01-02T00:00:00Z",
        }),
        createMockImplicitQueryAction({
          id: 3,
          name: "Create",
          kind: "row/create",
          model_id: modelCard.id,
          created_at: "2024-01-03T00:00:00Z",
        }),
      ];
      await setupActions({ model: modelCard, actions });

      const listItems = within(
        screen.getByRole("list", { name: "Action list" }),
      ).getAllByRole("listitem");
      expect(listItems.map((item) => item.getAttribute("aria-label"))).toEqual([
        "Create",
        "Update",
        "Delete",
      ]);
    });

    it("names the action in the delete confirmation and removes it from the list", async () => {
      const action = createMockQueryAction({
        name: "Delete Order",
        model_id: modelCard.id,
      });
      await setupActions({ model: modelCard, actions: [action] });

      await openActionMenu(action);
      await userEvent.click(await screen.findByText("Delete"));
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByText("Delete Delete Order?"),
      ).toBeInTheDocument();

      fetchMock.modifyRoute(`model-${modelCard.id}-actions-list`, {
        response: [],
      });
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Delete" }),
      );

      await waitFor(() => {
        expect(
          screen.queryByRole("listitem", { name: action.name }),
        ).not.toBeInTheDocument();
      });
    });

    it("asks for confirmation and shows the empty state after disabling basic actions", async () => {
      const actions = createMockImplicitCUDActions(modelCard.id);
      await setupActions({ model: modelCard, actions });

      await openHeaderActionsMenu();
      await userEvent.click(await screen.findByText("Disable basic actions"));
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByText("Disable basic actions?"),
      ).toBeInTheDocument();

      fetchMock.modifyRoute(`model-${modelCard.id}-actions-list`, {
        response: [],
      });
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Disable" }),
      );

      expect(
        await screen.findByText("No actions have been created yet."),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("list", { name: "Action list" }),
      ).not.toBeInTheDocument();
      for (const action of actions) {
        expect(
          screen.queryByRole("listitem", { name: action.name }),
        ).not.toBeInTheDocument();
      }
    });
  });

  describe("running actions", () => {
    const modelCard = createStructuredModelCard();

    const ID_PARAMETER = createMockActionParameter({
      id: "id",
      "display-name": "ID",
      type: "type/Integer",
    });
    const USER_ID_PARAMETER = createMockActionParameter({
      id: "user_id",
      "display-name": "User ID",
      type: "type/Integer",
    });
    const TEAM_NAME_PARAMETER = createMockActionParameter({
      id: "team_name",
      "display-name": "Team Name",
      type: "type/Text",
    });
    const CREATED_AT_PARAMETER = createMockActionParameter({
      id: "created_at",
      "display-name": "Created At",
      type: "type/Text",
      required: false,
    });
    const TOTAL_PARAMETER = createMockActionParameter({
      id: "total",
      "display-name": "Total",
      type: "type/Text",
      required: true,
    });
    const STATUS_PARAMETER = createMockActionParameter({
      id: "current_status",
      "display-name": "Current Status",
      type: "type/Text",
    });

    async function runAction(action: WritebackAction) {
      const listItem = screen.getByRole("listitem", { name: action.name });
      await userEvent.click(within(listItem).getByLabelText("Run"));
      const modal = await screen.findByTestId("action-execute-modal");
      await waitForLoaderToBeRemoved();
      return modal;
    }

    function createQueryActionWithStatus(statusSettings: {
      hidden: boolean;
      required: boolean;
    }) {
      return createMockQueryAction({
        id: 10,
        name: "Demo Action",
        model_id: modelCard.id,
        database_id: TEST_DATABASE_WITH_ACTIONS.id,
        parameters: [TOTAL_PARAMETER, STATUS_PARAMETER],
        visualization_settings: {
          type: "form",
          fields: {
            [TOTAL_PARAMETER.id]: getDefaultFieldSettings({
              id: TOTAL_PARAMETER.id,
              required: true,
            }),
            [STATUS_PARAMETER.id]: getDefaultFieldSettings({
              id: STATUS_PARAMETER.id,
              ...statusSettings,
            }),
          },
        },
      });
    }

    it("shows field and form errors when an implicit action violates a constraint", async () => {
      const action = createMockImplicitQueryAction({
        id: 2,
        name: "Update",
        kind: "row/update",
        model_id: modelCard.id,
        database_id: TEST_DATABASE_WITH_ACTIONS.id,
        parameters: [ID_PARAMETER, USER_ID_PARAMETER],
      });
      setupExecuteActionEndpoint(action.id, {
        status: 400,
        body: {
          message: "Unable to update the record.",
          errors: {
            user_id: 'This value does not exist in table "people".',
          },
        },
      });
      await setupActions({ model: modelCard, actions: [action] });

      const modal = await runAction(action);
      await userEvent.type(within(modal).getByLabelText("ID"), "1");
      await userEvent.type(within(modal).getByLabelText("User ID"), "999999");
      await userEvent.click(
        within(modal).getByRole("button", { name: "Update" }),
      );

      expect(
        await within(modal).findByText(
          'This value does not exist in table "people".',
        ),
      ).toBeInTheDocument();
      expect(
        within(modal).getByText("Unable to update the record."),
      ).toBeInTheDocument();
      expect(within(modal).getByLabelText("User ID")).toBeInTheDocument();

      await userEvent.click(
        within(modal).getByRole("button", { name: "Cancel" }),
      );
      await waitFor(() => {
        expect(
          screen.queryByTestId("action-execute-modal"),
        ).not.toBeInTheDocument();
      });
    });

    it("hides hidden fields and shows a success toast after running an implicit create action", async () => {
      const action = createMockImplicitQueryAction({
        id: 1,
        name: "Create",
        kind: "row/create",
        model_id: modelCard.id,
        database_id: TEST_DATABASE_WITH_ACTIONS.id,
        parameters: [TEAM_NAME_PARAMETER, CREATED_AT_PARAMETER],
        visualization_settings: {
          type: "form",
          fields: {
            [TEAM_NAME_PARAMETER.id]: getDefaultFieldSettings({
              id: TEAM_NAME_PARAMETER.id,
            }),
            [CREATED_AT_PARAMETER.id]: getDefaultFieldSettings({
              id: CREATED_AT_PARAMETER.id,
              hidden: true,
              required: false,
            }),
          },
        },
      });
      setupExecuteActionEndpoint(action.id, {
        body: { "created-row": { id: 1, team_name: "Zebras" } },
      });
      await setupActions({ model: modelCard, actions: [action] });

      const modal = await runAction(action);
      expect(
        within(modal).queryByLabelText("Created At"),
      ).not.toBeInTheDocument();
      await userEvent.type(within(modal).getByLabelText("Team Name"), "Zebras");
      await userEvent.click(
        within(modal).getByRole("button", { name: "Save" }),
      );

      expect(await screen.findByText("Successfully saved")).toBeInTheDocument();
      await waitFor(() => {
        expect(
          screen.queryByTestId("action-execute-modal"),
        ).not.toBeInTheDocument();
      });
    });

    it("hides an optional hidden field and shows a success toast after running a query action", async () => {
      const action = createQueryActionWithStatus({
        hidden: true,
        required: false,
      });
      setupExecuteActionEndpoint(action.id, { body: { "rows-affected": 1 } });
      await setupActions({ model: modelCard, actions: [action] });

      const modal = await runAction(action);
      expect(
        within(modal).queryByLabelText("Current Status"),
      ).not.toBeInTheDocument();
      await userEvent.type(within(modal).getByLabelText("Total"), "1");
      await userEvent.click(
        within(modal).getByRole("button", { name: action.name }),
      );

      expect(
        await screen.findByText(`${action.name} ran successfully`),
      ).toBeInTheDocument();
    });

    it("can't be submitted when a required field is hidden", async () => {
      const action = createQueryActionWithStatus({
        hidden: true,
        required: true,
      });
      await setupActions({ model: modelCard, actions: [action] });

      const modal = await runAction(action);
      expect(
        within(modal).queryByLabelText("Current Status"),
      ).not.toBeInTheDocument();
      await userEvent.type(within(modal).getByLabelText("Total"), "1");

      expect(
        within(modal).getByRole("button", { name: action.name }),
      ).toBeDisabled();
    });

    it("requires a visible required field before it can be submitted", async () => {
      const action = createQueryActionWithStatus({
        hidden: false,
        required: true,
      });
      await setupActions({ model: modelCard, actions: [action] });

      const modal = await runAction(action);
      await userEvent.type(within(modal).getByLabelText("Total"), "1");
      const submitButton = within(modal).getByRole("button", {
        name: action.name,
      });
      expect(submitButton).toBeDisabled();

      await userEvent.type(
        within(modal).getByLabelText("Current Status"),
        "active",
      );
      await waitFor(() => expect(submitButton).toBeEnabled());
    });
  });

  describe("native model", () => {
    const modelCard = createNativeModelCard();

    it("doesn't allow to create basic actions", async () => {
      await setup({ model: modelCard });

      expect(screen.queryByLabelText("Action menu")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Create basic actions" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("redirects to query builder when trying to open a question", async () => {
      const { model: question, router } = await setup({
        model: createStructuredModelCard({ type: "question" }),
      });

      expect(router?.location.pathname).toBe(Urls.question(question));
    });

    it("shows 404 when opening an archived model", async () => {
      const { model } = await setup({
        model: createStructuredModelCard({ archived: true }),
      });
      // Unjustified type cast. FIXME
      const modelName = model.displayName() as string;

      expect(screen.queryByText(modelName)).not.toBeInTheDocument();
      expect(
        screen.getByText("The page you asked for couldn't be found."),
      ).toBeInTheDocument();
    });
  });
});
