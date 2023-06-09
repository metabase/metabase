import { IndexRedirect, Redirect, Route } from "react-router";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  fireEvent,
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import {
  setupModelActionsEndpoints,
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";

import { checkNotNull } from "metabase/core/utils/types";
import { ActionsApi } from "metabase/services";

import Actions from "metabase/entities/actions";
import Models from "metabase/entities/questions";
import { ModalRoute } from "metabase/hoc/ModalRoute";

import ActionCreator from "metabase/actions/containers/ActionCreatorModal";

import type {
  Card,
  Collection,
  Database,
  Field,
  WritebackAction,
  WritebackQueryAction,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockField,
  createMockImplicitCUDActions,
  createMockImplicitQueryAction,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockQueryAction as _createMockQueryAction,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createNativeModelCard as _createNativeModelCard,
  createSavedNativeCard,
  createSavedStructuredCard,
  createStructuredModelCard as _createStructuredModelCard,
} from "metabase-types/api/mocks/presets";
import { useCollectionListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import * as ML_Urls from "metabase-lib/urls";
import { TYPE } from "metabase-lib/types/constants";

import ModelDetailPage from "./ModelDetailPage";

console.warn = jest.fn();
console.error = jest.fn();

// eslint-disable-next-line react/display-name
jest.mock("metabase/actions/containers/ActionCreator", () => () => (
  <div data-testid="mock-action-editor" />
));

const TEST_DATABASE_ID = 1;
const TEST_TABLE_ID = 1;
const TEST_FIELD = createMockField({
  id: 1,
  display_name: "Field 1",
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

const TEST_QUERY = "UPDATE orders SET status = 'shipped";

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

const COLLECTION_1 = createMockCollection({
  id: 5,
  name: "C1",
  can_write: true,
});

const COLLECTION_2 = createMockCollection({
  id: 10,
  name: "C2",
  can_write: true,
});

type SetupOpts = {
  model: Card;
  tab?: string;
  actions?: WritebackAction[];
  databases?: Database[];
  collections?: Collection[];
  usedBy?: Card[];
};

const TestModelDetailPage: typeof ModelDetailPage = props => {
  const { data, error, isLoading } = useCollectionListQuery();

  if (!data) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return <ModelDetailPage {...props} />;
};

const TestActionCreator: typeof ActionCreator = props => {
  const { data, error, isLoading } = useCollectionListQuery();

  if (!data) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return <ActionCreator {...props} />;
};

async function setup({
  model: card,
  tab = "usage",
  actions = [],
  databases = [TEST_DATABASE],
  collections = [],
  usedBy = [],
}: SetupOpts) {
  const metadata = createMockMetadata({
    databases: databases,
    tables: [TEST_TABLE, TEST_FK_TABLE_1],
    fields: TEST_FIELDS,
    questions: [card, ...usedBy],
  });

  const model = checkNotNull(metadata.question(card.id));
  const usedByQuestions = usedBy.map(q =>
    checkNotNull(metadata.question(q.id)),
  );

  const modelUpdateSpy = jest.spyOn(Models.actions, "update");

  setupDatabasesEndpoints(databases);

  fetchMock.get(
    {
      url: "path:/api/card",
      query: { f: "using_model", model_id: card.id },
    },
    usedBy,
  );

  setupCardsEndpoints([card]);
  setupModelActionsEndpoints(actions, model.id());
  setupCollectionsEndpoints({ collections });

  const name = model.displayName()?.toLowerCase();
  const slug = `${model.id()}-${name}`;
  const baseUrl = `/model/${slug}/detail`;
  const initialRoute = `${baseUrl}/${tab}`;

  const { history } = renderWithProviders(
    <>
      <Route path="/model/:slug/detail">
        <IndexRedirect to="usage" />
        <Route path="usage" component={TestModelDetailPage} />
        <Route path="schema" component={TestModelDetailPage} />
        <Route path="actions" component={TestModelDetailPage}>
          <ModalRoute
            path="new"
            modal={TestActionCreator}
            modalProps={{ enableTransition: false }}
          />
          <ModalRoute
            path=":actionId"
            modal={TestActionCreator}
            modalProps={{ enableTransition: false }}
          />
        </Route>
        <Redirect from="*" to="usage" />
      </Route>
      <Route path="/question/:slug" component={() => null} />
    </>,
    { withRouter: true, initialRoute },
  );

  await waitForElementToBeRemoved(() => screen.queryAllByText(/Loading/i));

  return { model, history, baseUrl, metadata, usedByQuestions, modelUpdateSpy };
}

async function setupActions({
  tab = "actions",
  databases = [TEST_DATABASE_WITH_ACTIONS],
  ...opts
}: SetupOpts) {
  return setup({
    tab,
    databases,
    ...opts,
  });
}

function openActionMenu(action: WritebackAction) {
  const listItem = screen.getByRole("listitem", { name: action.name });
  const menuButton = within(listItem).getByLabelText("ellipsis icon");
  userEvent.click(menuButton);
}

describe("ModelDetailPage", () => {
  describe.each([
    { type: "structured", getModel: createStructuredModelCard },
    { type: "native", getModel: createNativeModelCard },
  ])(`$type model`, ({ getModel }) => {
    it("renders and shows general info", async () => {
      await setup({
        model: getModel({ name: "My Model", description: "Foo Bar" }),
      });

      expect(screen.getByText("My Model")).toBeInTheDocument();
      expect(screen.getByLabelText("Description")).toHaveTextContent("Foo Bar");
    });

    it("displays model contact", async () => {
      const creator = createMockUser();
      await setup({ model: getModel({ creator }) });

      expect(screen.getByLabelText("Contact")).toHaveTextContent(
        creator.common_name,
      );
    });

    describe("management", () => {
      it("allows to rename modal", async () => {
        const { model, modelUpdateSpy } = await setup({ model: getModel() });

        const input = screen.getByDisplayValue(model.displayName() as string);
        userEvent.clear(input);
        userEvent.type(input, "New model name");
        fireEvent.blur(input);

        await waitFor(() => {
          expect(modelUpdateSpy).toHaveBeenCalledWith({
            ...model.card(),
            name: "New model name",
          });
        });
      });

      it("allows to change description", async () => {
        const { model, modelUpdateSpy } = await setup({ model: getModel() });

        const input = screen.getByPlaceholderText("Add description");
        userEvent.type(input, "Foo bar");
        fireEvent.blur(input);

        await waitFor(() => {
          expect(modelUpdateSpy).toHaveBeenCalledWith({
            ...model.card(),
            description: "Foo bar",
          });
        });
        expect(screen.getByLabelText("Description")).toHaveTextContent(
          "Foo bar",
        );
      });

      it("can be archived", async () => {
        const { model, modelUpdateSpy } = await setup({ model: getModel() });

        userEvent.click(getIcon("ellipsis"));
        userEvent.click(screen.getByText("Archive"));

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        userEvent.click(screen.getByRole("button", { name: "Archive" }));

        await waitFor(() => {
          expect(modelUpdateSpy).toHaveBeenCalledWith(
            { id: model.id() },
            { archived: true },
            expect.anything(),
          );
        });
      });

      it("can be moved to another collection", async () => {
        const { model, modelUpdateSpy } = await setup({
          model: getModel({ collection_id: 1 }),
          collections: [COLLECTION_1, COLLECTION_2],
        });

        userEvent.click(getIcon("ellipsis"));
        userEvent.click(screen.getByText("Move"));

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        userEvent.click(await screen.findByText(COLLECTION_2.name));
        userEvent.click(screen.getByRole("button", { name: "Move" }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        await waitFor(() => {
          expect(modelUpdateSpy).toHaveBeenCalledWith(
            { id: model.id() },
            { collection_id: COLLECTION_2.id },
            expect.anything(),
          );
        });
      });
    });

    describe("used by section", () => {
      it("has an empty state", async () => {
        const { model } = await setup({ model: getModel() });

        expect(
          screen.getByRole("link", { name: /Create a new question/i }),
        ).toHaveAttribute("href", ML_Urls.getUrl(model));
        expect(
          screen.getByText(/This model is not used by any questions yet/i),
        ).toBeInTheDocument();
      });

      it("lists questions based on the model", async () => {
        const { usedByQuestions } = await setup({
          model: getModel({ name: "My Model" }),
          usedBy: [
            createSavedStructuredCard({ id: 5, name: "Q1" }),
            createSavedNativeCard({ id: 6, name: "Q2" }),
          ],
        });
        const [q1, q2] = usedByQuestions;

        expect(screen.getByRole("link", { name: "Q1" })).toHaveAttribute(
          "href",
          ML_Urls.getUrl(q1),
        );
        expect(screen.getByRole("link", { name: "Q2" })).toHaveAttribute(
          "href",
          ML_Urls.getUrl(q2),
        );

        expect(
          screen.queryByText(/Create a new question/i),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText(/This model is not used by any questions yet/i),
        ).not.toBeInTheDocument();
      });
    });

    describe("schema section", () => {
      it("displays model schema", async () => {
        const { model } = await setup({ model: getModel(), tab: "schema" });
        const fields = model.getResultMetadata();

        userEvent.click(screen.getByText("Schema"));

        expect(fields.length).toBeGreaterThan(0);
        expect(screen.getByText(`${fields.length} fields`)).toBeInTheDocument();

        fields.forEach((field: Field) => {
          expect(screen.getByText(field.display_name)).toBeInTheDocument();
        });
      });
    });

    describe("actions section", () => {
      it("is shown if actions are enabled for model's database", async () => {
        await setup({
          model: getModel(),
          databases: [TEST_DATABASE_WITH_ACTIONS],
        });
        expect(screen.getByText("Actions")).toBeInTheDocument();
      });

      it("isn't shown if actions are disabled for model's database", async () => {
        await setup({ model: getModel() });
        expect(screen.queryByText("Actions")).not.toBeInTheDocument();
      });

      it("is shown if actions are disabled for the model's database but there are existing actions", async () => {
        const model = getModel();
        const action = createMockQueryAction({ model_id: model.id });

        await setup({ model, actions: [action] });

        expect(screen.getByText("Actions")).toBeInTheDocument();
      });

      it("redirects to 'Used by' when trying to access actions tab without them enabled", async () => {
        const { baseUrl, history } = await setup({
          model: getModel(),
          tab: "actions",
        });

        expect(history?.getCurrentLocation().pathname).toBe(`${baseUrl}/usage`);
        expect(screen.getByRole("tab", { name: "Used by" })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      it("does not redirect to another tab if actions are disabled for the model's database but there are existing actions", async () => {
        const model = getModel();
        const action = createMockQueryAction({ model_id: model.id });

        await setup({ model, actions: [action], tab: "actions" });

        expect(screen.getByRole("tab", { name: "Actions" })).toHaveAttribute(
          "aria-selected",
          "true",
        );
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
        userEvent.click(screen.getByRole("link", { name: "New action" }));
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

        userEvent.click(screen.getByRole("link", { name: "New action" }));

        expect(await screen.findByTestId("mock-action-editor")).toBeVisible();
      });

      it("allows to edit a query action via link", async () => {
        const model = getModel();
        const action = createMockQueryAction({ model_id: model.id });
        await setupActions({ model, actions: [action] });

        userEvent.click(screen.getByRole("link", { name: action.name }));

        expect(await screen.findByTestId("mock-action-editor")).toBeVisible();
      });

      it("allows to edit a query action via menu", async () => {
        const model = getModel();
        const action = createMockQueryAction({ model_id: model.id });
        await setupActions({ model, actions: [action] });

        openActionMenu(action);
        userEvent.click(screen.getByText("Edit"));

        expect(await screen.findByTestId("mock-action-editor")).toBeVisible();
      });

      it("allows to archive a query action", async () => {
        const updateActionSpy = jest.spyOn(ActionsApi, "update");
        const model = getModel();
        const action = createMockQueryAction({ model_id: model.id });
        await setupActions({ model, actions: [action] });

        const listItem = screen.getByRole("listitem", { name: action.name });
        userEvent.click(within(listItem).getByLabelText("ellipsis icon"));
        userEvent.click(screen.getByText("Archive"));

        const modal = screen.getByRole("dialog");
        userEvent.click(within(modal).getByRole("button", { name: "Archive" }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(updateActionSpy).toHaveBeenCalledWith({
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

        openActionMenu(action);

        expect(screen.queryByText("Archive")).not.toBeInTheDocument();
      });

      it("allows to disable implicit actions", async () => {
        const deleteActionSpy = jest.spyOn(Actions.actions, "delete");
        const model = getModel();
        const actions = createMockImplicitCUDActions(model.id);
        await setupActions({ model, actions });

        userEvent.click(screen.getByLabelText("Actions menu"));
        userEvent.click(screen.getByText("Disable basic actions"));
        userEvent.click(screen.getByRole("button", { name: "Disable" }));

        actions.forEach(action => {
          expect(deleteActionSpy).toHaveBeenCalledWith({ id: action.id });
        });
      });
    });

    describe("read-only permissions", () => {
      const modelCard = getModel({ can_write: false });

      it("doesn't allow to rename a model", async () => {
        const { model } = await setup({ model: modelCard });
        expect(
          screen.getByDisplayValue(model.displayName() as string),
        ).toBeDisabled();
      });

      it("doesn't allow to change description", async () => {
        await setup({ model: modelCard });
        expect(screen.getByPlaceholderText("No description")).toBeDisabled();
      });

      it("doesn't show model management actions", async () => {
        await setup({ model: modelCard });
        expect(queryIcon("ellipsis")).not.toBeInTheDocument();
        expect(screen.queryByText("Archive")).not.toBeInTheDocument();
        expect(screen.queryByText("Move")).not.toBeInTheDocument();
      });

      it("doesn't show a link to the query editor", async () => {
        await setup({ model: modelCard });
        expect(screen.queryByText("Edit definition")).not.toBeInTheDocument();
      });

      it("doesn't show a link to the metadata editor", async () => {
        await setup({ model: modelCard });
        userEvent.click(screen.getByText("Schema"));
        expect(screen.queryByText("Edit metadata")).not.toBeInTheDocument();
      });

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

        openActionMenu(action);

        expect(screen.getByText("View")).toBeInTheDocument();
      });

      it("doesn't allow to archive actions", async () => {
        const action = createMockQueryAction({ model_id: modelCard.id });
        await setupActions({ model: modelCard, actions: [action] });

        openActionMenu(action);

        expect(screen.queryByText("Archive")).not.toBeInTheDocument();
      });
    });

    describe("no data permissions", () => {
      it("doesn't show model editor links", async () => {
        await setup({
          model: getModel(),
          databases: [],
          tab: "schema",
        });
        expect(screen.queryByText("Edit definition")).not.toBeInTheDocument();
        expect(screen.queryByText("Edit metadata")).not.toBeInTheDocument();
      });

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

    it("displays backing table", async () => {
      await setup({ model: modelCard });
      expect(screen.getByLabelText("Backing table")).toHaveTextContent(
        TEST_TABLE.display_name,
      );
    });

    it("displays related tables", async () => {
      const { metadata } = await setup({ model: modelCard });
      const TABLE_1 = checkNotNull(metadata.table(TEST_FK_TABLE_1_ID));

      const list = within(screen.getByTestId("model-relationships"));

      expect(
        list.getByRole("link", { name: TABLE_1.displayName() }),
      ).toHaveAttribute("href", ML_Urls.getUrl(TABLE_1.newQuestion()));
      expect(list.queryByText("Reviews")).not.toBeInTheDocument();
    });

    it("allows to create implicit actions", async () => {
      const createActionSpy = jest.spyOn(ActionsApi, "create");
      const action = createMockQueryAction({ model_id: modelCard.id });
      await setupActions({ model: modelCard, actions: [action] });

      userEvent.click(screen.getByLabelText("Actions menu"));
      userEvent.click(screen.getByText("Create basic actions"));

      await waitFor(() => {
        expect(createActionSpy).toHaveBeenCalledWith({
          name: "Create",
          type: "implicit",
          kind: "row/create",
          model_id: modelCard.id,
        });
      });
      expect(createActionSpy).toHaveBeenCalledWith({
        name: "Update",
        type: "implicit",
        kind: "row/update",
        model_id: modelCard.id,
      });
      expect(createActionSpy).toHaveBeenCalledWith({
        name: "Delete",
        type: "implicit",
        kind: "row/delete",
        model_id: modelCard.id,
      });
    });

    it("allows to create implicit actions from the empty state", async () => {
      const createActionSpy = jest.spyOn(ActionsApi, "create");
      await setupActions({ model: modelCard, actions: [] });

      userEvent.click(
        screen.getByRole("button", { name: /Create basic action/i }),
      );

      await waitFor(() => {
        expect(createActionSpy).toHaveBeenCalledWith({
          name: "Create",
          type: "implicit",
          kind: "row/create",
          model_id: modelCard.id,
        });
      });
      expect(createActionSpy).toHaveBeenCalledWith({
        name: "Update",
        type: "implicit",
        kind: "row/update",
        model_id: modelCard.id,
      });
      expect(createActionSpy).toHaveBeenCalledWith({
        name: "Delete",
        type: "implicit",
        kind: "row/delete",
        model_id: modelCard.id,
      });
    });

    it("doesn't allow to create implicit actions when they already exist", async () => {
      await setupActions({
        model: modelCard,
        actions: createMockImplicitCUDActions(modelCard.id),
      });

      userEvent.click(screen.getByLabelText("Actions menu"));

      expect(
        screen.queryByText(/Create basic action/i),
      ).not.toBeInTheDocument();
    });

    it("doesn't allow to disable implicit actions if they don't exist", async () => {
      await setupActions({ model: modelCard, actions: [] });

      userEvent.click(screen.getByLabelText("Actions menu"));

      expect(
        screen.queryByText("Disable basic actions"),
      ).not.toBeInTheDocument();
    });

    describe("no data permissions", () => {
      it("shows limited model info", async () => {
        await setup({ model: modelCard, databases: [] });

        expect(screen.queryByText("Relationships")).not.toBeInTheDocument();
        expect(screen.queryByText("Backing table")).not.toBeInTheDocument();
        expect(
          screen.queryByText(TEST_TABLE.display_name),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("native model", () => {
    const modelCard = createNativeModelCard();

    it("doesn't show backing table", async () => {
      await setup({ model: modelCard });
      expect(screen.queryByLabelText("Backing table")).not.toBeInTheDocument();
    });

    it("doesn't show related tables", async () => {
      await setup({ model: modelCard });
      expect(
        screen.queryByTestId("model-relationships"),
      ).not.toBeInTheDocument();
    });

    it("doesn't allow to create basic actions", async () => {
      await setup({ model: modelCard });

      expect(screen.queryByLabelText("Action menu")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Create basic actions" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    const modelCard = createStructuredModelCard();

    it("navigates between tabs", async () => {
      const { baseUrl, history } = await setup({
        model: modelCard,
        databases: [TEST_DATABASE_WITH_ACTIONS],
      });

      expect(history?.getCurrentLocation().pathname).toBe(`${baseUrl}/usage`);
      expect(screen.getByRole("tab", { name: "Used by" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      userEvent.click(screen.getByText("Schema"));
      expect(history?.getCurrentLocation().pathname).toBe(`${baseUrl}/schema`);
      expect(screen.getByRole("tab", { name: "Schema" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      userEvent.click(screen.getByText("Actions"));
      expect(history?.getCurrentLocation().pathname).toBe(`${baseUrl}/actions`);
      expect(screen.getByRole("tab", { name: "Actions" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      userEvent.click(screen.getByText("Used by"));
      expect(history?.getCurrentLocation().pathname).toBe(`${baseUrl}/usage`);
      expect(screen.getByRole("tab", { name: "Used by" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    it("redirects to 'Used by' when opening an unknown tab", async () => {
      const { baseUrl, history } = await setup({
        model: modelCard,
        tab: "foo-bar",
      });

      expect(history?.getCurrentLocation().pathname).toBe(`${baseUrl}/usage`);
      expect(screen.getByRole("tab", { name: "Used by" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

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
