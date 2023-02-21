import React from "react";
import userEvent from "@testing-library/user-event";
import nock from "nock";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";

import { GroupTableAccessPolicy } from "metabase-types/api";
import EditSandboxingModal from "./EditSandboxingModal";

const attributes = ["foo", "bar"];
const params = {
  groupId: "1",
  tableId: "2",
};

const setup = ({
  shouldMockQuestions = false,
  policy = undefined,
}: {
  shouldMockQuestions?: boolean;
  policy?: GroupTableAccessPolicy;
} = {}) => {
  nock(location.origin).post("/api/mt/gtap/validate").reply(204);

  if (shouldMockQuestions) {
    nock(location.origin)
      .get("/api/collection")
      .reply(200, [
        {
          id: "root",
          name: "Our analytics",
          can_write: true,
        },
      ]);
    nock(location.origin)
      .get("/api/collection/root/items")
      .reply(200, {
        data: [{ id: 1, name: "sandbox question", model: "card" }],
      });
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
      withSampleDatabase: true,
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
            foo: ["dimension", ["field", 13, null]],
          },
          card_id: null,
          group_id: 1,
          table_id: 2,
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
          table_id: 2,
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
