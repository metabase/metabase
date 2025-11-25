import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAdhocQueryMetadataEndpoint,
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import type {
  DatabaseFeature,
  GroupTableAccessPolicy,
} from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockGroup,
} from "metabase-types/api/mocks";
import {
  PEOPLE,
  PEOPLE_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import EditSandboxingModal from "./EditSandboxingModal";

const attributes = ["foo", "bar"];
const params = {
  groupId: "1",
  tableId: String(PEOPLE_ID),
};

const EDITABLE_ROOT_COLLECTION = createMockCollection({
  ...ROOT_COLLECTION,
  can_write: true,
});

const TEST_CARD = createMockCard({
  id: 1,
  name: "sandbox question",
  can_write: true,
  collection_id: null,
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": PEOPLE_ID,
    },
  },
});

const setup = async ({
  shouldMockQuestions = false,
  policy = undefined,
  features = COMMON_DATABASE_FEATURES,
}: {
  shouldMockQuestions?: boolean;
  policy?: GroupTableAccessPolicy;
  features?: DatabaseFeature[];
} = {}) => {
  mockGetBoundingClientRect();
  const database = createSampleDatabase({ features: features });

  setupDatabasesEndpoints([database]);
  setupCollectionsEndpoints({
    collections: [EDITABLE_ROOT_COLLECTION],
    rootCollection: EDITABLE_ROOT_COLLECTION,
  });

  setupRecentViewsAndSelectionsEndpoints([]);
  setupAdhocQueryMetadataEndpoint(
    createMockCardQueryMetadata({ databases: [database] }),
  );

  fetchMock.post("path:/api/mt/gtap/validate", 204);
  fetchMock.get(
    "path:/api/permissions/group/1",
    createMockGroup({ members: [] }),
  );

  if (shouldMockQuestions) {
    fetchMock.get("path:/api/collection/root/items", {
      data: [{ id: TEST_CARD.id, name: TEST_CARD.name, model: "card" }],
    });
    fetchMock.get("path:/api/collection/1/items", {
      data: [],
    });
    fetchMock.get("path:/api/collection/1", EDITABLE_ROOT_COLLECTION);
    setupCardsEndpoints([TEST_CARD]);
    setupCardQueryMetadataEndpoint(
      TEST_CARD,
      createMockCardQueryMetadata({
        databases: [database],
      }),
    );
  }

  const onSave = jest.fn();

  renderWithProviders(
    <EditSandboxingModal
      onCancel={jest.fn()}
      onSave={onSave}
      attributes={attributes}
      params={params}
      policy={policy}
    />,
  );

  await waitForLoaderToBeRemoved();

  return { onSave };
};

describe("EditSandboxingModal", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("EditSandboxingModal", () => {
    describe("creating new policy", () => {
      it("should allow creating a new policy", async () => {
        const { onSave } = await setup();

        expect(
          screen.getByText("Configure row and column security for this table"),
        ).toBeInTheDocument();

        expect(
          screen.getByText("Filter by a column in the table"),
        ).toBeInTheDocument();

        expect(
          await screen.findByText(
            "Use a saved question to create a custom view for this table",
          ),
        ).toBeInTheDocument();

        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        await userEvent.click(await screen.findByText("Pick a column"));
        await userEvent.click(await screen.findByText("ID"));

        await userEvent.click(
          screen.getByPlaceholderText("Pick a user attribute"),
        );
        await userEvent.click(await screen.findByText("foo"));

        await userEvent.click(screen.getByText("Save"));

        await waitFor(() =>
          expect(onSave).toHaveBeenCalledWith({
            attribute_remappings: {
              foo: [
                "dimension",
                ["field", PEOPLE.ID, { "base-type": "type/BigInteger" }],
                { "stage-number": 0 },
              ],
            },
            card_id: null,
            group_id: 1,
            table_id: PEOPLE_ID,
          }),
        );
      });

      it("should not allow sandboxing with a question if that feature is not enabled", async () => {
        const { onSave } = await setup({ features: [] });

        expect(
          screen.getByText("Configure row and column security for this table"),
        ).toBeInTheDocument();

        expect(
          screen.queryByText("Filter by a column in the table"),
        ).not.toBeInTheDocument();

        expect(
          screen.queryByText(
            "Use a saved question to create a custom view for this table",
          ),
        ).not.toBeInTheDocument();

        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        await userEvent.click(await screen.findByText("Pick a column"));
        await userEvent.click(await screen.findByText("ID"));

        await userEvent.click(
          screen.getByPlaceholderText("Pick a user attribute"),
        );
        await userEvent.click(await screen.findByText("foo"));

        await userEvent.click(screen.getByText("Save"));

        await waitFor(() =>
          expect(onSave).toHaveBeenCalledWith({
            attribute_remappings: {
              foo: [
                "dimension",
                ["field", PEOPLE.ID, { "base-type": "type/BigInteger" }],
                { "stage-number": 0 },
              ],
            },
            card_id: null,
            group_id: 1,
            table_id: PEOPLE_ID,
          }),
        );
      });

      it("should allow creating a new policy based on a card", async () => {
        const { onSave } = await setup({ shouldMockQuestions: true });

        expect(
          screen.getByText("Configure row and column security for this table"),
        ).toBeInTheDocument();

        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        await userEvent.click(
          await screen.findByText(
            "Use a saved question to create a custom view for this table",
          ),
        );

        await userEvent.click(await screen.findByText("Select a question"));
        await screen.findByTestId("entity-picker-modal");
        await userEvent.click(
          await screen.findByRole("link", { name: /sandbox question/i }),
        );

        await userEvent.click(await screen.findByText("Save"));

        await waitFor(() => {
          expect(screen.queryByText("Saving...")).not.toBeInTheDocument();
        });

        await waitFor(() => {
          expect(onSave).toHaveBeenCalledWith({
            attribute_remappings: {},
            card_id: 1,
            group_id: 1,
            table_id: PEOPLE_ID,
          });
        });
      });
    });
  });

  describe("editing policies", () => {
    it("should allow editing an existing policy", async () => {
      const { onSave } = await setup({
        shouldMockQuestions: true,
        policy: {
          id: 1,
          table_id: 1,
          group_id: 1,
          card_id: null,
          permission_id: 50,
          attribute_remappings: {
            foo: ["dimension", ["field", 13, null]],
          },
        },
      });

      expect(
        screen.getByText("Configure row and column security for this table"),
      ).toBeInTheDocument();

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

      await userEvent.click(
        await screen.findByText(
          "Use a saved question to create a custom view for this table",
        ),
      );

      await userEvent.click(await screen.findByText("Select a question"));
      await screen.findByTestId("entity-picker-modal");
      await userEvent.click(
        await screen.findByRole("link", { name: /sandbox question/i }),
      );

      await userEvent.click(await screen.findByText("Save"));

      await waitFor(() => {
        expect(screen.queryByText("Saving...")).not.toBeInTheDocument();
      });

      expect(onSave).toHaveBeenCalledWith({
        id: 1,
        attribute_remappings: {
          foo: ["dimension", ["field", 13, null]],
        },
        permission_id: 50,
        card_id: 1,
        group_id: 1,
        table_id: 1,
      });
    });
  });
});
