import React from "react";
import nock from "nock";
import userEvent from "@testing-library/user-event";
import { FieldValues, Table } from "metabase-types/api";
import {
  createMockCollection,
  createMockField,
  createMockFieldValues,
} from "metabase-types/api/mocks";
import {
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
    it("should show a message about not connected fields", async () => {
      setup();

      expect(
        await screen.findByText(/You haven’t connected a field/),
      ).toBeInTheDocument();
    });

    it("should show a message about missing field values", async () => {
      setup({
        parameter: createMockUiParameter({
          fields: [new Field(createMockField())],
        }),
      });

      expect(
        await screen.findByText(/We don’t have any cached values/),
      ).toBeInTheDocument();
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
  });
});

interface SetupOpts {
  parameter?: UiParameter;
  tables?: Table[];
  fieldsValues?: FieldValues[];
}

const setup = ({
  parameter = createMockUiParameter(),
  fieldsValues = [],
}: SetupOpts = {}) => {
  const scope = nock(location.origin);
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  setupCollectionsEndpoints(scope, [
    createMockCollection({
      id: "root",
      name: "Our analytics",
    }),
  ]);

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
