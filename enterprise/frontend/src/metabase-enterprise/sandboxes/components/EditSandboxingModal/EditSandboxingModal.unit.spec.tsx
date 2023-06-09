import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from "__support__/ui";

import { GroupTableAccessPolicy } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  PEOPLE,
  PEOPLE_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { useCollectionListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { ROOT_COLLECTION } from "metabase/entities/collections";

import EditSandboxingModal from "./EditSandboxingModal";

const attributes = ["foo", "bar"];
const params = {
  groupId: "1",
  tableId: String(PEOPLE_ID),
};

const EDITABLE_ROOT_COLLECTION = {
  ...ROOT_COLLECTION,
  can_write: true,
};

const TEST_CARD = createMockCard({
  id: 1,
  name: "sandbox question",
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": PEOPLE_ID,
    },
  },
});

const TestComponent: typeof EditSandboxingModal = props => {
  const { data, error, isLoading } = useCollectionListQuery();

  if (!data) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return <EditSandboxingModal {...props} />;
};

const setup = async ({
  shouldMockQuestions = false,
  policy = undefined,
}: {
  shouldMockQuestions?: boolean;
  policy?: GroupTableAccessPolicy;
} = {}) => {
  const database = createSampleDatabase();
  setupDatabasesEndpoints([database]);
  setupCollectionsEndpoints({ collections: [EDITABLE_ROOT_COLLECTION] });
  fetchMock.post("path:/api/mt/gtap/validate", 204);
  fetchMock.get("path:/api/permissions/group/1", {});

  if (shouldMockQuestions) {
    fetchMock.get("path:/api/collection/root/items", {
      data: [{ id: TEST_CARD.id, name: TEST_CARD.name, model: "card" }],
    });
    setupCardsEndpoints([TEST_CARD]);
  }

  const onSave = jest.fn();

  renderWithProviders(
    <TestComponent
      onCancel={jest.fn()}
      onSave={onSave}
      attributes={attributes}
      params={params}
      policy={policy}
    />,
  );

  await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));

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
          screen.getByText("Grant sandboxed access to this table"),
        ).toBeInTheDocument();

        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        userEvent.click(screen.getByText("Pick a column"));
        userEvent.click(await screen.findByText("ID"));

        userEvent.click(screen.getByText("Pick a user attribute"));
        userEvent.click(await screen.findByText("foo"));

        userEvent.click(screen.getByText("Save"));

        await waitFor(() =>
          expect(onSave).toHaveBeenCalledWith({
            attribute_remappings: {
              foo: ["dimension", ["field", PEOPLE.ID, null]],
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
          screen.getByText("Grant sandboxed access to this table"),
        ).toBeInTheDocument();

        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        userEvent.click(
          screen.getByText(
            "Use a saved question to create a custom view for this table",
          ),
        );

        userEvent.click(await screen.findByText(TEST_CARD.name));

        userEvent.click(screen.getByText("Save"));

        await waitForElementToBeRemoved(() => screen.queryByText("Saving..."));

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
        screen.getByText("Grant sandboxed access to this table"),
      ).toBeInTheDocument();

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

      userEvent.click(
        screen.getByText(
          "Use a saved question to create a custom view for this table",
        ),
      );

      userEvent.click(await screen.findByText(TEST_CARD.name));

      userEvent.click(screen.getByText("Save"));

      await waitForElementToBeRemoved(() => screen.queryByText("Saving..."));

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
