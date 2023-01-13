import React from "react";
import nock from "nock";
import userEvent from "@testing-library/user-event";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { Card, FieldValues } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockField,
  createMockFieldValues,
} from "metabase-types/api/mocks";
import {
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupFieldsValuesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import Field from "metabase-lib/metadata/Field";
import { UiParameter } from "metabase-lib/parameters/types";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import ValuesSourceModal from "./ValuesSourceModal";

describe("ValuesSourceModal", () => {
  describe("fields source", () => {
    it("should show a message about not connected fields", () => {
      setup();

      expect(screen.getByText(/haven’t connected a field/)).toBeInTheDocument();
    });

    it("should show a message about missing field values", async () => {
      setup({
        parameter: createMockUiParameter({
          fields: [new Field(createMockField({ id: 1 }))],
        }),
        fieldsValues: [
          createMockFieldValues({
            field_id: 1,
            values: [],
          }),
        ],
      });

      await waitFor(() => {
        expect(screen.getByText(/any cached values/)).toBeInTheDocument();
      });
    });

    it("should show unique non-null mapped fields values", async () => {
      setup({
        parameter: createMockUiParameter({
          fields: [
            new Field(createMockField({ id: 1 })),
            new Field(createMockField({ id: 2 })),
          ],
        }),
        fieldsValues: [
          createMockFieldValues({
            field_id: 1,
            values: [["A"], [null], ["B"], ["A"]],
          }),
          createMockFieldValues({
            field_id: 2,
            values: [["B", "Remapped"], ["C"]],
          }),
        ],
      });

      await waitFor(() => {
        expect(screen.getByRole("textbox")).toHaveValue("A\nB\nC");
      });
    });
  });

  describe("card source", () => {
    it("should allow to select only string-based fields", async () => {
      const { onSubmit } = setup({
        parameter: createMockUiParameter({
          values_source_type: "card",
          values_source_config: {
            card_id: 1,
          },
        }),
        cards: [
          createMockCard({
            id: 1,
            name: "Products",
            result_metadata: [
              createMockField({
                id: 1,
                display_name: "ID",
                base_type: "type/BigInteger",
              }),
              createMockField({
                id: 2,
                display_name: "Category",
                base_type: "type/Text",
              }),
            ],
          }),
        ],
      });

      expect(await screen.findByText(/Selectable values/)).toBeInTheDocument();
      userEvent.click(screen.getByRole("button", { name: /Pick a column/ }));
      userEvent.click(screen.getByRole("heading", { name: /Category/ }));
      userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(onSubmit).toHaveBeenCalledWith("card", {
        card_id: 1,
        value_field: ["field", 2, null],
      });
    });
  });

  describe("list source", () => {
    it("should set static list values", () => {
      const { onSubmit } = setup();

      userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
      userEvent.type(screen.getByRole("textbox"), "Gadget\nWidget");
      userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(onSubmit).toHaveBeenCalledWith("static-list", {
        values: ["Gadget", "Widget"],
      });
    });

    it("preserves the list when changing the source type", () => {
      setup({
        parameter: createMockUiParameter({
          values_source_type: "static-list",
          values_source_config: {
            values: ["Gadget", "Widget"],
          },
        }),
      });

      userEvent.click(screen.getByRole("radio", { name: /connected fields/ }));
      userEvent.click(screen.getByRole("radio", { name: "Custom list" }));

      expect(screen.getByRole("textbox")).toHaveValue("Gadget\nWidget");
    });
  });
});

interface SetupOpts {
  parameter?: UiParameter;
  cards?: Card[];
  fieldsValues?: FieldValues[];
}

const setup = ({
  parameter = createMockUiParameter(),
  cards = [],
  fieldsValues = [],
}: SetupOpts = {}) => {
  const scope = nock(location.origin);
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  setupCollectionsEndpoints(scope, [createMockCollection(ROOT_COLLECTION)]);
  setupCardsEndpoints(scope, cards);
  setupFieldsValuesEndpoints(scope, fieldsValues);

  renderWithProviders(
    <ValuesSourceModal
      parameter={parameter}
      onSubmit={onSubmit}
      onClose={onClose}
    />,
  );

  return { onSubmit };
};
