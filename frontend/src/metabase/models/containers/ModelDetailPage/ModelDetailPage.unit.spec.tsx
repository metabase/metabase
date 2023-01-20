import React from "react";
import nock from "nock";
import userEvent from "@testing-library/user-event";

import {
  fireEvent,
  renderWithProviders,
  getIcon,
  queryIcon,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import {
  setupActionsEndpoints,
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";

import { checkNotNull } from "metabase/core/utils/types";
import { ActionsApi } from "metabase/services";
import Models from "metabase/entities/questions";
import { getMetadata } from "metabase/selectors/metadata";

import type {
  Card,
  Collection,
  Field,
  WritebackAction,
  WritebackQueryAction,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockField,
  createMockTable,
  createMockUser,
  createMockImplicitCUDActions,
  createMockQueryAction as _createMockQueryAction,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
} from "metabase-types/api/mocks";

import { TYPE } from "metabase-lib/types/constants";
import type Question from "metabase-lib/Question";
import {
  getStructuredModel as _getStructuredModel,
  getNativeModel as _getNativeModel,
  getSavedStructuredQuestion,
  getSavedNativeQuestion,
  StructuredSavedCard,
  NativeSavedCard,
} from "metabase-lib/mocks";

import ModelDetailPage from "./ModelDetailPage";

// eslint-disable-next-line react/display-name
jest.mock("metabase/core/components/Link", () => ({ to, ...props }: any) => (
  <a {...props} href={to} />
));

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
const TEST_FK_FIELD = createMockField({
  id: 4,
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
    fk_target_field_id: TEST_FK_FIELD.id,
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

function getStructuredModel(card?: Partial<StructuredSavedCard>) {
  return _getStructuredModel({
    ...card,
    result_metadata: TEST_FIELDS,
    dataset_query: createMockStructuredDatasetQuery({
      database: TEST_DATABASE_ID,
      query: createMockStructuredQuery({ "source-table": TEST_TABLE_ID }),
    }),
  });
}

function getNativeModel(card?: Partial<NativeSavedCard>) {
  return _getNativeModel({
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
  model: Question;
  actions?: WritebackAction[];
  hasActionsEnabled?: boolean;
  collections?: Collection[];
  usedBy?: Question[];
};

async function setup({
  model,
  actions = [],
  collections = [],
  usedBy = [],
  hasActionsEnabled = false,
}: SetupOpts) {
  const scope = nock(location.origin).persist();

  const modelUpdateSpy = jest.spyOn(Models.actions, "update");

  const card = model.card() as Card;
  const slug = `${card.id}-model-name`;

  setupDatabasesEndpoints(scope, [
    hasActionsEnabled ? TEST_DATABASE_WITH_ACTIONS : TEST_DATABASE,
  ]);

  scope
    .get("/api/card")
    .query({ f: "using_model", model_id: card.id })
    .reply(
      200,
      usedBy.map(question => question.card()),
    );

  setupCardsEndpoints(scope, [card]);
  setupActionsEndpoints(scope, model.id(), actions);
  setupCollectionsEndpoints(scope, collections);

  const { store } = renderWithProviders(<ModelDetailPage params={{ slug }} />);

  await waitForElementToBeRemoved(() =>
    screen.queryByTestId("loading-spinner"),
  );

  const metadata = getMetadata(store.getState());

  return { metadata, scope, modelUpdateSpy };
}

type SetupActionsOpts = Omit<SetupOpts, "hasActionsEnabled">;

async function setupActions(opts: SetupActionsOpts) {
  const result = await setup({ ...opts, hasActionsEnabled: true });

  userEvent.click(screen.getByText("Actions"));
  await waitForElementToBeRemoved(() =>
    screen.queryByTestId("loading-spinner"),
  );

  return result;
}

describe("ModelDetailPage", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  [
    { type: "structured", getModel: getStructuredModel },
    { type: "native", getModel: getNativeModel },
  ].forEach(testCase => {
    const { type, getModel } = testCase;

    describe(`${type} model`, () => {
      it("renders and shows general info", async () => {
        await setup({
          model: getModel({ name: "My Model", description: "Foo Bar" }),
        });

        expect(screen.getByText("My Model")).toBeInTheDocument();
        expect(screen.getByLabelText("Description")).toHaveTextContent(
          "Foo Bar",
        );
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
          const model = getModel();
          const { modelUpdateSpy } = await setup({ model });

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
          const model = getModel();
          const { modelUpdateSpy } = await setup({ model });

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
          const model = getModel();
          const { modelUpdateSpy } = await setup({ model });

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
          const model = getModel({ collection_id: 1 });
          const { modelUpdateSpy } = await setup({
            model,
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
          const model = getModel();
          await setup({ model });

          expect(
            screen.getByRole("link", { name: /Create a new question/i }),
          ).toHaveAttribute("href", model.getUrl());
          expect(
            screen.getByText(/This model is not used by any questions yet/i),
          ).toBeInTheDocument();
        });

        it("lists questions based on the model", async () => {
          const q1 = getSavedStructuredQuestion({ id: 5, name: "Q1" });
          const q2 = getSavedNativeQuestion({ id: 6, name: "Q2" });

          await setup({
            model: getModel({ name: "My Model" }),
            usedBy: [q1, q2],
          });

          expect(screen.getByRole("link", { name: "Q1" })).toHaveAttribute(
            "href",
            q1.getUrl(),
          );
          expect(screen.getByRole("link", { name: "Q2" })).toHaveAttribute(
            "href",
            q2.getUrl(),
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
          const model = getModel();
          const fields = model.getResultMetadata();
          await setup({ model });

          userEvent.click(screen.getByText("Schema"));

          expect(fields.length).toBeGreaterThan(0);
          expect(
            screen.getByText(`${fields.length} fields`),
          ).toBeInTheDocument();

          fields.forEach((field: Field) => {
            expect(screen.getByText(field.display_name)).toBeInTheDocument();
          });
        });
      });

      describe("actions section", () => {
        it("is shown if actions are enabled for model's database", async () => {
          await setup({ model: getModel(), hasActionsEnabled: true });
          expect(screen.getByText("Actions")).toBeInTheDocument();
        });

        it("isn't shown if actions are disabled for model's database", async () => {
          await setup({ model: getModel(), hasActionsEnabled: false });
          expect(screen.queryByText("Actions")).not.toBeInTheDocument();
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

        it("allows to create a new query action from the empty state", async () => {
          await setupActions({ model: getModel(), actions: [] });
          userEvent.click(screen.getByRole("button", { name: "New action" }));
          expect(screen.getByTestId("mock-action-editor")).toBeVisible();
        });

        it("lists existing query actions", async () => {
          const model = getModel();
          const action = createMockQueryAction({ model_id: model.id() });
          await setupActions({ model, actions: [action] });

          expect(screen.getByText(action.name)).toBeInTheDocument();
          expect(screen.getByText(TEST_QUERY)).toBeInTheDocument();
        });

        it("lists existing implicit actions", async () => {
          const model = getModel();
          await setupActions({
            model,
            actions: createMockImplicitCUDActions(model.id()),
          });

          expect(screen.getByText("Create")).toBeInTheDocument();
          expect(screen.getByText("Update")).toBeInTheDocument();
          expect(screen.getByText("Delete")).toBeInTheDocument();
        });

        it("allows to create a new query action", async () => {
          const model = getModel();
          await setupActions({
            model,
            actions: [createMockQueryAction({ model_id: model.id() })],
          });

          userEvent.click(screen.getByRole("button", { name: "New action" }));

          expect(screen.getByTestId("mock-action-editor")).toBeVisible();
        });

        it("allows to edit a query action", async () => {
          const model = getModel();
          const action = createMockQueryAction({ model_id: model.id() });
          await setupActions({ model, actions: [action] });

          const listItem = screen.getByRole("listitem", { name: action.name });
          userEvent.click(within(listItem).getByLabelText("pencil icon"));

          expect(screen.getByTestId("mock-action-editor")).toBeVisible();
        });

        it("allows to create implicit actions", async () => {
          const createActionSpy = jest.spyOn(ActionsApi, "create");
          const model = getModel();
          const action = createMockQueryAction({ model_id: model.id() });
          await setupActions({ model, actions: [action] });

          userEvent.click(screen.getByTestId("new-action-menu"));
          userEvent.click(screen.getByText("Create basic actions"));

          await waitFor(() => {
            expect(createActionSpy).toHaveBeenCalledWith({
              name: "Create",
              type: "implicit",
              kind: "row/create",
              model_id: model.id(),
            });
          });
          expect(createActionSpy).toHaveBeenCalledWith({
            name: "Update",
            type: "implicit",
            kind: "row/update",
            model_id: model.id(),
          });
          expect(createActionSpy).toHaveBeenCalledWith({
            name: "Delete",
            type: "implicit",
            kind: "row/delete",
            model_id: model.id(),
          });
        });

        it("allows to create implicit actions from the empty state", async () => {
          const createActionSpy = jest.spyOn(ActionsApi, "create");
          const model = getModel();
          await setupActions({ model, actions: [] });

          userEvent.click(
            screen.getByRole("button", { name: /Create basic action/i }),
          );

          await waitFor(() => {
            expect(createActionSpy).toHaveBeenCalledWith({
              name: "Create",
              type: "implicit",
              kind: "row/create",
              model_id: model.id(),
            });
          });
          expect(createActionSpy).toHaveBeenCalledWith({
            name: "Update",
            type: "implicit",
            kind: "row/update",
            model_id: model.id(),
          });
          expect(createActionSpy).toHaveBeenCalledWith({
            name: "Delete",
            type: "implicit",
            kind: "row/delete",
            model_id: model.id(),
          });
        });

        it("doesn't allow to create implicit actions when they already exist", async () => {
          const model = getModel();
          await setupActions({
            model,
            actions: createMockImplicitCUDActions(model.id()),
          });

          expect(
            screen.queryByText(/Create basic action/i),
          ).not.toBeInTheDocument();
          expect(
            screen.queryByTestId("new-action-menu"),
          ).not.toBeInTheDocument();
        });
      });

      describe("read-only permissions", () => {
        const model = getModel({ can_write: false });

        it("doesn't allow to rename a model", async () => {
          await setup({ model });
          expect(
            screen.getByDisplayValue(model.displayName() as string),
          ).toBeDisabled();
        });

        it("doesn't allow to change description", async () => {
          await setup({ model });
          expect(screen.getByPlaceholderText("No description")).toBeDisabled();
        });

        it("doesn't show model management actions", async () => {
          await setup({ model });
          expect(queryIcon("ellipsis")).not.toBeInTheDocument();
          expect(screen.queryByText("Archive")).not.toBeInTheDocument();
          expect(screen.queryByText("Move")).not.toBeInTheDocument();
        });

        it("doesn't show a link to the query editor", async () => {
          await setup({ model });
          expect(screen.queryByText("Edit definition")).not.toBeInTheDocument();
        });

        it("doesn't show a link to the metadata editor", async () => {
          await setup({ model });
          userEvent.click(screen.getByText("Schema"));
          expect(screen.queryByText("Edit metadata")).not.toBeInTheDocument();
        });

        it("doesn't allow to create actions", async () => {
          await setupActions({ model, actions: [] });
          expect(screen.queryByText("New action")).not.toBeInTheDocument();
          expect(
            screen.queryByText("Create basic actions"),
          ).not.toBeInTheDocument();
          expect(
            screen.queryByTestId("new-action-menu"),
          ).not.toBeInTheDocument();
        });

        it("doesn't allow to edit actions", async () => {
          const action = createMockQueryAction({ model_id: model.id() });
          await setupActions({ model, actions: [action] });

          const listItem = screen.getByRole("listitem", { name: action.name });
          const editButton = within(listItem).queryByLabelText("pencil icon");

          expect(editButton).not.toBeInTheDocument();
        });
      });
    });
  });

  describe("structured model", () => {
    const model = getStructuredModel();

    it("displays backing table", async () => {
      await setup({ model });
      expect(screen.getByLabelText("Backing table")).toHaveTextContent(
        TEST_TABLE.display_name,
      );
    });

    it("displays related tables", async () => {
      const { metadata } = await setup({ model });
      const TABLE_1 = checkNotNull(metadata.table(TEST_FK_TABLE_1_ID));

      const list = within(screen.getByTestId("model-relationships"));

      expect(
        list.getByRole("link", { name: TABLE_1.displayName() }),
      ).toHaveAttribute("href", TABLE_1.newQuestion().getUrl());
      expect(list.queryByText("Reviews")).not.toBeInTheDocument();
    });
  });

  describe("native model", () => {
    const model = getNativeModel();

    it("doesn't show backing table", async () => {
      await setup({ model });
      expect(screen.queryByLabelText("Backing table")).not.toBeInTheDocument();
    });

    it("doesn't show related tables", async () => {
      await setup({ model });
      expect(
        screen.queryByTestId("model-relationships"),
      ).not.toBeInTheDocument();
    });
  });
});
