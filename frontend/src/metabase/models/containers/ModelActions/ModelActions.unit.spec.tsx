import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { IndexRedirect, Route } from "react-router";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupCardsUsingModelEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupModelActionsEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import ActionCreator from "metabase/actions/containers/ActionCreatorModal";
import { Questions as Models } from "metabase/entities/questions";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { checkNotNull } from "metabase/lib/types";
import { TYPE } from "metabase-lib/v1/types/constants";
import * as ML_Urls from "metabase-lib/v1/urls";
import type {
  Card,
  Collection,
  Database,
  Settings,
  WritebackAction,
  WritebackQueryAction,
} from "metabase-types/api";
import {
  createMockQueryAction as _createMockQueryAction,
  createMockCardQueryMetadata,
  createMockDatabase,
  createMockField,
  createMockImplicitCUDActions,
  createMockImplicitQueryAction,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  createNativeModelCard as _createNativeModelCard,
  createStructuredModelCard as _createStructuredModelCard,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import ModelActions from "./ModelActions";

// eslint-disable-next-line react/display-name
jest.mock("metabase/actions/containers/ActionCreator", () => () => (
  <div data-testid="mock-action-editor" />
));

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

const TEST_DATABASE_WITH_ACTIONS = createMockDatabase({
  ...TEST_DATABASE,
  settings: { "database-enable-actions": true },
});

const TEST_DATABASE_WITH_ACTIONS_READONLY = createMockDatabase({
  ...TEST_DATABASE_WITH_ACTIONS,
  native_permissions: "none",
});

function createStructuredModelCard(card?: Partial<Card>) {
  return _createStructuredModelCard({
    can_write: true,
    ...card,
    result_metadata: TEST_FIELDS,
    dataset_query: createMockStructuredDatasetQuery({
      database: TEST_DATABASE_ID,
      query: createMockStructuredQuery({ "source-table": TEST_TABLE_ID }),
    }),
  });
}

function createNativeModelCard(card?: Partial<Card>) {
  return _createNativeModelCard({
    can_write: true,
    ...card,
    result_metadata: TEST_FIELDS,
    dataset_query: createMockNativeDatasetQuery({
      database: TEST_DATABASE_ID,
      native: createMockNativeQuery({
        query: `SELECT * FROM ${TEST_TABLE.name}`,
      }),
    }),
  });
}

const TEST_QUERY = "UPDATE orders SET status = 'shipped'";

function createMockQueryAction(
  opts?: Partial<WritebackQueryAction>,
): WritebackQueryAction {
  return _createMockQueryAction({
    ...opts,
    dataset_query: createMockNativeDatasetQuery({
      native: createMockNativeQuery({ query: TEST_QUERY }),
    }),
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
};

async function setup({
  model: card,
  actions = [],
  databases = [TEST_DATABASE],
  collections = [],
  usedBy = [],
  settings = {},
}: SetupOpts) {
  const storeInitialState = createMockState({
    settings: createMockSettingsState(settings),
  });
  const metadata = createMockMetadata({
    databases: databases,
    tables: [TEST_TABLE, TEST_FK_TABLE_1],
    fields: TEST_FIELDS,
    questions: [card, ...usedBy],
  });

  const model = checkNotNull(metadata.question(card.id));
  const usedByQuestions = usedBy.map((q) =>
    checkNotNull(metadata.question(q.id)),
  );

  const modelUpdateSpy = jest.spyOn(Models.actions, "update");

  setupDatabasesEndpoints(databases);
  setupCardsUsingModelEndpoint(card, usedBy);
  setupCardsEndpoints([card]);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({
      databases,
      tables: [
        createMockTable({
          id: `card__${card.id}`,
          name: card.name,
          fields: card.result_metadata ?? [],
        }),
      ],
    }),
  );
  setupModelActionsEndpoints(actions, model.id());
  setupCollectionsEndpoints({ collections });

  const name = model.displayName()?.toLowerCase();
  const slug = `${model.id()}-${name}`;
  const baseUrl = `/model/${slug}/detail`;

  const { history } = renderWithProviders(
    <>
      <Route path="/model/:slug/detail">
        <IndexRedirect to="actions" />
        <Route path="actions" component={ModelActions}>
          <ModalRoute
            path="new"
            modal={ActionCreator}
            modalProps={{ enableTransition: false }}
          />
          <ModalRoute
            path=":actionId"
            modal={ActionCreator}
            modalProps={{ enableTransition: false }}
          />
        </Route>
      </Route>
      <Route path="/question/:slug" component={() => null} />
    </>,
    { withRouter: true, initialRoute: baseUrl, storeInitialState },
  );

  await waitForLoaderToBeRemoved();

  return { model, history, baseUrl, metadata, usedByQuestions, modelUpdateSpy };
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

      it("allows to archive a query action", async () => {
        const model = getModel();
        const action = createMockQueryAction({ model_id: model.id });
        await setupActions({ model, actions: [action] });

        const listItem = screen.getByRole("listitem", { name: action.name });
        await userEvent.click(within(listItem).getByLabelText("ellipsis icon"));
        await userEvent.click(await screen.findByText("Archive"));

        expect(
          screen.getByRole("heading", { name: /Archive/ }),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Archive" }));

        await waitFor(() =>
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );

        expect(
          fetchMock.callHistory.calls(`path:/api/action/${action.id}`, {
            method: "PUT",
          }),
        ).toHaveLength(1);
        const call = fetchMock.callHistory.lastCall(
          `path:/api/action/${action.id}`,
          {
            method: "PUT",
          },
        );
        expect(await call?.request?.json()).toEqual({
          id: action.id,
          archived: true,
        });
      });

      it("doesn't allow to archive an implicit action", async () => {
        const model = getModel();
        const action = createMockImplicitQueryAction({
          model_id: model.id,
        });
        await setupActions({ model, actions: [action] });

        await openActionMenu(action);

        expect(screen.queryByText("Archive")).not.toBeInTheDocument();
      });

      it("allows to disable implicit actions", async () => {
        const model = getModel();
        const actions = createMockImplicitCUDActions(model.id);
        await setupActions({ model, actions });

        await userEvent.click(screen.getByLabelText("Actions menu"));
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
        const action = createMockQueryAction({ model_id: modelCard.id });
        await setupActions({ model: modelCard, actions: [action] });

        await openActionMenu(action);

        expect(await screen.findByText("View")).toBeInTheDocument();
      });

      it("doesn't allow to archive actions", async () => {
        const action = createMockQueryAction({ model_id: modelCard.id });
        await setupActions({ model: modelCard, actions: [action] });

        await openActionMenu(action);

        expect(screen.queryByText("Archive")).not.toBeInTheDocument();
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

    it("allows to create implicit actions", async () => {
      const action = createMockQueryAction({ model_id: modelCard.id });
      await setupActions({ model: modelCard, actions: [action] });
      fetchMock.modifyRoute("action-post", { response: {} });

      await userEvent.click(screen.getByLabelText("Actions menu"));
      await userEvent.click(await screen.findByText("Create basic actions"));

      const createActionCalls = fetchMock.callHistory.calls(
        "path:/api/action",
        {
          method: "POST",
        },
      );
      expect(createActionCalls).toHaveLength(3);

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

      const createActionCalls = fetchMock.callHistory.calls(
        "path:/api/action",
        {
          method: "POST",
        },
      );
      expect(createActionCalls).toHaveLength(3);

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

      await userEvent.click(screen.getByLabelText("Actions menu"));

      expect(
        screen.queryByText(/Create basic action/i),
      ).not.toBeInTheDocument();
    });

    it("doesn't allow to disable implicit actions if they don't exist", async () => {
      await setupActions({ model: modelCard, actions: [] });

      await userEvent.click(screen.getByLabelText("Actions menu"));

      expect(
        screen.queryByText("Disable basic actions"),
      ).not.toBeInTheDocument();
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
      const { model: question, history } = await setup({
        model: createSavedStructuredCard(),
      });

      expect(history?.getCurrentLocation().pathname).toBe(
        ML_Urls.getUrl(question),
      );
    });

    it("shows 404 when opening an archived model", async () => {
      const { model } = await setup({
        model: createStructuredModelCard({ archived: true }),
      });
      const modelName = model.displayName() as string;

      expect(screen.queryByText(modelName)).not.toBeInTheDocument();
      expect(
        screen.getByText("The page you asked for couldn't be found."),
      ).toBeInTheDocument();
    });
  });
});
