import userEvent from "@testing-library/user-event";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { checkNotNull } from "metabase/core/utils/types";
import type { Card, ParameterValues } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDatabase,
  createMockField,
  createMockParameterValues,
} from "metabase-types/api/mocks";
import { createMockMetadata } from "__support__/metadata";
import {
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupErrorParameterValuesEndpoints,
  setupParameterValuesEndpoints,
  setupUnauthorizedCardsEndpoints,
  setupUnauthorizedCollectionsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { UiParameter } from "metabase-lib/parameters/types";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import ValuesSourceModal from "./ValuesSourceModal";

describe("ValuesSourceModal", () => {
  const metadata = createMockMetadata({
    fields: [
      createMockField({
        id: 1,
        base_type: "type/Text",
        semantic_type: "type/Category",
      }),
      createMockField({
        id: 2,
        base_type: "type/Text",
        semantic_type: "type/Category",
      }),
    ],
  });

  const field1 = checkNotNull(metadata.field(1));
  const field2 = checkNotNull(metadata.field(2));

  describe("fields source", () => {
    it("should show a message about not connected fields", async () => {
      await setup();

      expect(
        screen.getByText(/You haven’t connected a field to this filter/),
      ).toBeInTheDocument();
    });

    it("should show a message about missing field values", async () => {
      await setup({
        parameter: createMockUiParameter({
          fields: [field1],
        }),
        parameterValues: createMockParameterValues({
          values: [],
        }),
      });

      expect(
        screen.getByText(/We don’t have any cached values/),
      ).toBeInTheDocument();
    });

    it("should show field values", async () => {
      await setup({
        parameter: createMockUiParameter({
          fields: [field1, field2],
        }),
        parameterValues: createMockParameterValues({
          values: [["A"], ["B"], ["C"]],
        }),
      });

      expect(screen.getByRole("textbox")).toHaveValue("A\nB\nC");
    });

    it("should not show the fields option for variable template tags", async () => {
      await setup({
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

    it("should preserve custom list option for variable template tags", async () => {
      await setup({
        parameter: createMockUiParameter({
          values_source_type: "static-list",
          hasVariableTemplateTagTarget: true,
        }),
      });

      expect(screen.getByRole("radio", { name: "Custom list" })).toBeChecked();
    });

    it("should copy field values when switching to custom list", async () => {
      await setup({
        parameter: createMockUiParameter({
          fields: [field1, field2],
          values_source_config: {
            values: ["A", "B"],
          },
        }),
        parameterValues: createMockParameterValues({
          values: [["C"], ["D"]],
        }),
      });
      expect(screen.getByRole("textbox")).toHaveValue("C\nD");

      userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
      expect(screen.getByRole("radio", { name: "Custom list" })).toBeChecked();
      expect(screen.getByRole("textbox")).toHaveValue("C\nD");
    });

    it("should not overwrite custom list values when field values are empty", async () => {
      await setup({
        parameter: createMockUiParameter({
          fields: [field1, field2],
          values_source_config: {
            values: ["A", "B"],
          },
        }),
        parameterValues: createMockParameterValues({
          values: [],
        }),
      });
      expect(
        screen.getByText(/We don’t have any cached values/),
      ).toBeInTheDocument();

      userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
      expect(screen.getByRole("radio", { name: "Custom list" })).toBeChecked();
      expect(screen.getByRole("textbox")).toHaveValue("A\nB");
    });
  });

  describe("card source", () => {
    it("should show a message when there are no text columns", async () => {
      await setup({
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
        screen.getByText(/This question doesn’t have any text columns/),
      ).toBeInTheDocument();
    });

    it("should allow to select only text fields", async () => {
      const { onSubmit } = await setup({
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

      userEvent.click(screen.getByRole("button", { name: /Pick a column/ }));
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
      await setup({
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

      expect(screen.getByRole("textbox")).toHaveValue("A\nB\nC");
    });

    it("should display a message when the user has no access to the card", async () => {
      await setup({
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
        hasCollectionAccess: false,
      });

      expect(
        screen.getByText("You don't have permissions to do that."),
      ).toBeInTheDocument();
    });

    it("should allow searching for a card without access to the root collection (metabase#30355)", async () => {
      await setup({
        hasCollectionAccess: false,
      });

      userEvent.click(
        screen.getByRole("radio", { name: "From another model or question" }),
      );
      userEvent.click(
        screen.getByRole("button", { name: /Pick a model or question…/ }),
      );

      expect(
        screen.getByPlaceholderText("Search for a question or model"),
      ).toBeInTheDocument();
    });

    it("should display a message when there is an error in the underlying query", async () => {
      await setup({
        parameter: createMockUiParameter({
          values_source_type: "card",
          values_source_config: {
            card_id: 1,
            value_field: ["field", 2, null],
          },
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
        hasParameterValuesError: true,
      });

      expect(
        screen.getByText("An error occurred in your query"),
      ).toBeInTheDocument();
    });

    it("should copy card values when switching to custom list", async () => {
      await setup({
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
      expect(screen.getByRole("textbox")).toHaveValue("A\nB\nC");

      userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
      expect(screen.getByRole("radio", { name: "Custom list" })).toBeChecked();
      expect(screen.getByRole("textbox")).toHaveValue("A\nB\nC");
    });
  });

  describe("list source", () => {
    it("should set static list values", async () => {
      const { onSubmit } = await setup();

      userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
      userEvent.type(screen.getByRole("textbox"), "Gadget\nWidget");
      userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(onSubmit).toHaveBeenCalledWith("static-list", {
        values: ["Gadget", "Widget"],
      });
    });

    it("should preserve the list when changing the source type", async () => {
      await setup({
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
  hasCollectionAccess?: boolean;
  hasParameterValuesError?: boolean;
}

const setup = async ({
  parameter = createMockUiParameter(),
  parameterValues = createMockParameterValues(),
  cards = [],
  hasCollectionAccess = true,
  hasParameterValuesError = false,
}: SetupOpts = {}) => {
  const databases = [createMockDatabase()];
  const collections = [createMockCollection(ROOT_COLLECTION)];
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  setupDatabasesEndpoints(databases);

  if (hasCollectionAccess) {
    setupCollectionsEndpoints({ collections });
    setupCardsEndpoints(cards);
  } else {
    setupUnauthorizedCollectionsEndpoints(collections);
    setupUnauthorizedCardsEndpoints(cards);
  }

  if (!hasParameterValuesError) {
    setupParameterValuesEndpoints(parameterValues);
  } else {
    setupErrorParameterValuesEndpoints();
  }

  renderWithProviders(
    <ValuesSourceModal
      parameter={parameter}
      onSubmit={onSubmit}
      onClose={onClose}
    />,
  );

  await waitFor(() => {
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
  });

  return { onSubmit };
};
