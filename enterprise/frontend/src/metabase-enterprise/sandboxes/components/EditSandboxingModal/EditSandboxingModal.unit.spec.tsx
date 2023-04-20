import React from "react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { createEntitiesState } from "__support__/store";
import {
  setupCardsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";

import { GroupTableAccessPolicy } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
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

const setup = ({
  shouldMockQuestions = false,
  policy = undefined,
}: {
  shouldMockQuestions?: boolean;
  policy?: GroupTableAccessPolicy;
} = {}) => {
  const database = createSampleDatabase();

  setupDatabasesEndpoints([database]);
  fetchMock.post("path:/api/mt/gtap/validate", 204);
  fetchMock.get("path:/api/permissions/group/1", {});

  if (shouldMockQuestions) {
    fetchMock.get("path:/api/collection", [
      {
        id: "root",
        name: "Our analytics",
        can_write: true,
      },
    ]);
    fetchMock.get("path:/api/collection/root/items", {
      data: [{ id: TEST_CARD.id, name: TEST_CARD.name, model: "card" }],
    });
    setupCardsEndpoints([TEST_CARD]);
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
    {
      storeInitialState: {
        entities: createEntitiesState({
          databases: [database],
        }),
      },
    },
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

        userEvent.click(screen.getByText("Pick a column"));
        userEvent.click(await screen.findByText("ID"));

        userEvent.click(screen.getByText("Pick a user attribute"));
        userEvent.click(await screen.findByText("foo"));

        userEvent.click(screen.getByText("Save"));

        expect(onSave).toHaveBeenCalledWith({
          attribute_remappings: {
            foo: ["dimension", ["field", PEOPLE.ID, null]],
          },
          card_id: null,
          group_id: 1,
          table_id: PEOPLE_ID,
        });
      });

      it("should allow creating a new policy based on a card", async () => {
        const { onSave } = setup({ shouldMockQuestions: true });

        expect(
          screen.getByText("Grant sandboxed access to this table"),
        ).toBeInTheDocument();

        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        userEvent.click(
          screen.getByText(
            "Use a saved question to create a custom view for this table",
          ),
        );

        userEvent.click(await screen.findByText("sandbox question"));

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

      userEvent.click(
        screen.getByText(
          "Use a saved question to create a custom view for this table",
        ),
      );

      userEvent.click(await screen.findByText("sandbox question"));

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
