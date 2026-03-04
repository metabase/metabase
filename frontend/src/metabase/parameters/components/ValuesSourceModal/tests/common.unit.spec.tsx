import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import {
  createMockCard,
  createMockField,
  createMockParameterValues,
} from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("ValuesSourceModal", () => {
  const metadata = createMockMetadata({
    fields: [
      createMockField({
        id: 1,
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: "type/Category",
      }),
      createMockField({
        id: 2,
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: "type/Category",
      }),
    ],
  });

  const field1 = checkNotNull(metadata.field(1));
  const field2 = checkNotNull(metadata.field(2));

  describe("fields source", () => {
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
        await screen.findByText(/We don’t have any cached values/),
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

      expect(await screen.findByRole("textbox")).toHaveValue("A\nB\nC");
    });

    it("should not show the connected fields option if parameter is not wired to any fields", async () => {
      await setup();
      expect(
        screen.queryByRole("radio", { name: "From connected fields" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "From another model or question" }),
      ).toBeChecked();
    });

    it("should show the fields option if parameter is wired to a field", async () => {
      await setup({
        parameter: createMockUiParameter({
          fields: [field1],
        }),
      });
      expect(
        screen.queryByRole("radio", { name: "From connected fields" }),
      ).toBeChecked();
      expect(
        screen.getByRole("radio", { name: "From another model or question" }),
      ).toBeInTheDocument();
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
      expect(await screen.findByRole("textbox")).toHaveValue("C\nD");

      await userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
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
        await screen.findByText(/We don’t have any cached values/),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
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
                name: "id",
                display_name: "ID",
                base_type: "type/BigInteger",
                effective_type: "type/BigInteger",
                semantic_type: "type/PK",
              }),
              createMockField({
                id: 2,
                name: "category",
                display_name: "Category",
                base_type: "type/Text",
                effective_type: "type/Text",
                semantic_type: "type/Category",
              }),
            ],
          }),
        ],
      });

      await userEvent.click(
        screen.getByRole("button", { name: /Pick a column/ }),
      );
      expect(
        screen.queryByRole("heading", { name: "ID" }),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("heading", { name: "Category" }));
      await userEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onSubmit).toHaveBeenCalledWith("card", {
        card_id: 1,
        value_field: ["field", "category", { "base-type": "type/Text" }],
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

      await userEvent.click(
        screen.getByRole("radio", { name: "From another model or question" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: /Pick a model or question/ }),
      );

      expect(await screen.findByPlaceholderText(/Search…/)).toBeInTheDocument();
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

      await userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
      expect(screen.getByRole("radio", { name: "Custom list" })).toBeChecked();
      expect(screen.getByRole("textbox")).toHaveValue("A\nB\nC");
    });
  });

  describe("list source", () => {
    it("should set static list values", async () => {
      const { onSubmit } = await setup();

      await userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
      await userEvent.type(screen.getByRole("textbox"), "Gadget\nWidget");
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(onSubmit).toHaveBeenCalledWith("static-list", {
        values: [["Gadget"], ["Widget"]],
      });
    });

    it("should preserve the list when changing the source type", async () => {
      await setup({
        parameter: createMockUiParameter({
          fields: [field1],
          values_source_type: "static-list",
          values_source_config: {
            values: [["Gadget"], ["Widget"]],
          },
        }),
      });

      await userEvent.click(
        screen.getByRole("radio", { name: "From connected fields" }),
      );
      await userEvent.click(screen.getByRole("radio", { name: "Custom list" }));

      expect(screen.getByRole("textbox")).toHaveValue("Gadget\nWidget");
    });

    it("should render a hint about using models when labels are used", async () => {
      await setup({
        showMetabaseLinks: true,
        parameter: createMockUiParameter({
          fields: [field1],
          values_source_type: "static-list",
          values_source_config: {
            values: [["Gadget", "Label"], ["Widget"]],
          },
        }),
      });

      await userEvent.click(
        screen.getByRole("radio", { name: "From connected fields" }),
      );
      await userEvent.click(screen.getByRole("radio", { name: "Custom list" }));

      expect(screen.getByRole("textbox")).toHaveValue("Gadget, Label\nWidget");
      expect(screen.getByText("do it once in a model")).toBeInTheDocument();
      expect(screen.getByText("do it once in a model").tagName).toBe("A");
    });
  });
});
