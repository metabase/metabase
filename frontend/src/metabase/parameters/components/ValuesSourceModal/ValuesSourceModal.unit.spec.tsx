import React from "react";
import nock from "nock";
import userEvent from "@testing-library/user-event";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { Card, ParameterValues } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockField,
  createMockParameterValues,
} from "metabase-types/api/mocks";
import {
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupParameterValuesEndpoints,
  setupUnauthorizedCardsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import Field from "metabase-lib/metadata/Field";
import { UiParameter } from "metabase-lib/parameters/types";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import ValuesSourceModal from "./ValuesSourceModal";

describe("ValuesSourceModal", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("fields source", () => {
    it("should show a message about not connected fields", () => {
      setup();

      expect(
        screen.getByText(/You haven’t connected a field to this filter/),
      ).toBeInTheDocument();
    });

    it("should show a message about missing field values", async () => {
      setup({
        parameter: createMockUiParameter({
          fields: [new Field(createMockField({ id: 1 }))],
        }),
        parameterValues: createMockParameterValues({
          values: [],
        }),
      });

      expect(
        await screen.findByText(/We don’t have any cached values/),
      ).toBeInTheDocument();
    });

    it("should show field values", async () => {
      setup({
        parameter: createMockUiParameter({
          fields: [
            new Field(createMockField({ id: 1 })),
            new Field(createMockField({ id: 2 })),
          ],
        }),
        parameterValues: createMockParameterValues({
          values: [["A"], ["B"], ["C"]],
        }),
      });

      await waitFor(() => {
        expect(screen.getByRole("textbox")).toHaveValue("A\nB\nC");
      });
    });

    it("should not show the fields option for variable template tags", () => {
      setup({
        parameter: createMockUiParameter({
          hasVariableTemplateTagTarget: true,
        }),
      });

      expect(
        screen.queryByRole("radio", { name: "From connected fields" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "From another model or question" }),
      ).toBeChecked();
    });

    it("should preserve custom list option for variable template tags", () => {
      setup({
        parameter: createMockUiParameter({
          values_source_type: "static-list",
          hasVariableTemplateTagTarget: true,
        }),
      });

      expect(screen.getByRole("radio", { name: "Custom list" })).toBeChecked();
    });
  });

  describe("card source", () => {
    it("should show a message when there are no text columns", async () => {
      setup({
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
          }),
        ],
      });

      expect(
        await screen.findByText(/This question doesn’t have any text columns/),
      ).toBeInTheDocument();
    });

    it("should allow to select only text fields", async () => {
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
                semantic_type: "type/PK",
              }),
              createMockField({
                id: 2,
                display_name: "Category",
                base_type: "type/Text",
                semantic_type: "type/Category",
              }),
            ],
          }),
        ],
      });

      userEvent.click(
        await screen.findByRole("button", { name: /Pick a column/ }),
      );
      expect(
        screen.queryByRole("heading", { name: "ID" }),
      ).not.toBeInTheDocument();

      userEvent.click(screen.getByRole("heading", { name: "Category" }));
      userEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onSubmit).toHaveBeenCalledWith("card", {
        card_id: 1,
        value_field: ["field", 2, null],
      });
    });

    it("should show card values", async () => {
      setup({
        parameter: createMockUiParameter({
          values_source_type: "card",
          values_source_config: {
            card_id: 1,
            value_field: ["field", 2, null],
          },
        }),
        parameterValues: createMockParameterValues({
          values: [["A"], ["B"], ["C"]],
        }),
        cards: [
          createMockCard({
            id: 1,
            name: "Products",
            result_metadata: [
              createMockField({
                id: 2,
                display_name: "Category",
                base_type: "type/Text",
                semantic_type: "type/Category",
              }),
            ],
          }),
        ],
      });

      await waitFor(() => {
        expect(screen.getByRole("textbox")).toHaveValue("A\nB\nC");
      });
    });

    it("should display an error message when the user has no access to the card", async () => {
      setup({
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
          }),
        ],
        hasDataAccess: false,
      });

      expect(
        await screen.findByText("You don't have permissions to do that."),
      ).toBeInTheDocument();
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

    it("should preserve the list when changing the source type", () => {
      setup({
        parameter: createMockUiParameter({
          values_source_type: "static-list",
          values_source_config: {
            values: ["Gadget", "Widget"],
          },
        }),
      });

      userEvent.click(
        screen.getByRole("radio", { name: "From connected fields" }),
      );
      userEvent.click(screen.getByRole("radio", { name: "Custom list" }));

      expect(screen.getByRole("textbox")).toHaveValue("Gadget\nWidget");
    });
  });
});

interface SetupOpts {
  parameter?: UiParameter;
  parameterValues?: ParameterValues;
  cards?: Card[];
  hasDataAccess?: boolean;
}

const setup = ({
  parameter = createMockUiParameter(),
  parameterValues = createMockParameterValues(),
  cards = [],
  hasDataAccess = true,
}: SetupOpts = {}) => {
  const scope = nock(location.origin);
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  if (hasDataAccess) {
    setupCollectionsEndpoints(scope, [createMockCollection(ROOT_COLLECTION)]);
    setupCardsEndpoints(scope, cards);
    setupParameterValuesEndpoints(scope, parameterValues);
  } else {
    setupUnauthorizedCardsEndpoints(scope, cards);
  }

  renderWithProviders(
    <ValuesSourceModal
      parameter={parameter}
      onSubmit={onSubmit}
      onClose={onClose}
    />,
  );

  return { onSubmit };
};
