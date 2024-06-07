import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAdhocQueryMetadataEndpoint,
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  mockScrollBy,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import type { GroupTableAccessPolicy } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  PEOPLE,
  PEOPLE_ID,
  SAMPLE_DB_ID,
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

const setup = ({
  shouldMockQuestions = false,
  policy = undefined,
}: {
  shouldMockQuestions?: boolean;
  policy?: GroupTableAccessPolicy;
} = {}) => {
  mockGetBoundingClientRect();
  mockScrollBy();
  const database = createSampleDatabase();

  setupDatabasesEndpoints([database]);
  setupCollectionsEndpoints({
    collections: [EDITABLE_ROOT_COLLECTION],
    rootCollection: EDITABLE_ROOT_COLLECTION,
  });
  setupRecentViewsEndpoints([]);
  setupAdhocQueryMetadataEndpoint(
    createMockCardQueryMetadata({ databases: [database] }),
  );

  fetchMock.post("path:/api/mt/gtap/validate", 204);
  fetchMock.get("path:/api/permissions/group/1", {});

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

  return { onSave };
};

describe("EditSandboxingModal", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("EditSandboxingModal", () => {
    describe("creating new policy", () => {
      it("should allow creating a new policy", async () => {
        const { onSave } = setup();

        expect(
          screen.getByText("Grant sandboxed access to this table"),
        ).toBeInTheDocument();

        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        await userEvent.click(await screen.findByText("Pick a column"));
        await userEvent.click(await screen.findByText("ID"));

        await userEvent.click(screen.getByText("Pick a user attribute"));
        await userEvent.click(await screen.findByText("foo"));

        await userEvent.click(screen.getByText("Save"));

        await waitFor(() =>
          expect(onSave).toHaveBeenCalledWith({
            attribute_remappings: {
              foo: [
                "dimension",
                ["field", PEOPLE.ID, { "base-type": "type/BigInteger" }],
              ],
            },
            card_id: null,
            group_id: 1,
            table_id: PEOPLE_ID,
          }),
        );
      });

      it("should allow creating a new policy based on a card", async () => {
        const { onSave } = setup({ shouldMockQuestions: true });

        expect(
          screen.getByText("Grant sandboxed access to this table"),
        ).toBeInTheDocument();

        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        await userEvent.click(
          screen.getByText(
            "Use a saved question to create a custom view for this table",
          ),
        );

        await userEvent.click(await screen.findByText("Select a question"));
        await screen.findByTestId("entity-picker-modal");
        await userEvent.click(
          await screen.findByRole("button", { name: /sandbox question/i }),
        );

        await userEvent.click(screen.getByText("Save"));

        await waitFor(() => {
          expect(screen.queryByText("Saving...")).not.toBeInTheDocument();
        });

        expect(onSave).toHaveBeenCalledWith({
          attribute_remappings: {},
          card_id: 1,
          group_id: 1,
          table_id: PEOPLE_ID,
        });
      });
    });
  });

  describe("editing policies", () => {
    it("should allow editing an existing policy", async () => {
      const { onSave } = setup({
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
        screen.getByText("Grant sandboxed access to this table"),
      ).toBeInTheDocument();

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

      await userEvent.click(
        screen.getByText(
          "Use a saved question to create a custom view for this table",
        ),
      );

      await userEvent.click(await screen.findByText("Select a question"));
      await screen.findByTestId("entity-picker-modal");
      await userEvent.click(
        await screen.findByRole("button", { name: /sandbox question/i }),
      );

      await userEvent.click(screen.getByText("Save"));

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
