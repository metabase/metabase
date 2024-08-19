import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockMetadata } from "__support__/metadata";
import {
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupErrorParameterValuesEndpoints,
  setupParameterValuesEndpoints,
  setupSearchEndpoints,
  setupUnauthorizedCardsEndpoints,
  setupUnauthorizedCollectionsEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupTableQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { checkNotNull } from "metabase/lib/types";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Card, ParameterValues } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDatabase,
  createMockField,
  createMockParameterValues,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import ValuesSourceModal from "./ValuesSourceModal";

describe("ValuesSourceModal", () => {
  describe("string paramter", () => {
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

        expect(
          screen.getByRole("radio", { name: "Custom list" }),
        ).toBeChecked();
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

        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );
        expect(
          screen.getByRole("radio", { name: "Custom list" }),
        ).toBeChecked();
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

        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );
        expect(
          screen.getByRole("radio", { name: "Custom list" }),
        ).toBeChecked();
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

        await userEvent.click(
          screen.getByRole("button", { name: /Pick a column/ }),
        );
        expect(
          screen.queryByRole("heading", { name: "ID" }),
        ).not.toBeInTheDocument();

        await userEvent.click(
          screen.getByRole("heading", { name: "Category" }),
        );
        await userEvent.click(screen.getByRole("button", { name: "Done" }));
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

        await userEvent.click(
          screen.getByRole("radio", { name: "From another model or question" }),
        );
        await userEvent.click(
          screen.getByRole("button", { name: /Pick a model or question/ }),
        );

        expect(
          await screen.findByPlaceholderText(/Search…/),
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

        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );
        expect(
          screen.getByRole("radio", { name: "Custom list" }),
        ).toBeChecked();
        expect(screen.getByRole("textbox")).toHaveValue("A\nB\nC");
      });
    });

    describe("list source", () => {
      it("should set static list values", async () => {
        const { onSubmit } = await setup();

        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );
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
        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );

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
        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );

        expect(screen.getByRole("textbox")).toHaveValue(
          "Gadget, Label\nWidget",
        );
        expect(screen.getByText("do it once in a model")).toBeInTheDocument();
        expect(screen.getByText("do it once in a model").tagName).toBe("A");
      });

      it("should render a hint about using models when labels are used, but without link when `show-metabase-links: false`", async () => {
        await setup({
          showMetabaseLinks: false,
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
        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );

        expect(screen.getByRole("textbox")).toHaveValue(
          "Gadget, Label\nWidget",
        );
        expect(screen.getByText("do it once in a model")).toBeInTheDocument();
        expect(screen.getByText("do it once in a model").tagName).not.toBe("A");
      });
    });
  });

  describe("number parameter", () => {
    const metadata = createMockMetadata({
      fields: [
        createMockField({
          id: 1,
          base_type: "type/Integer",
        }),
        createMockField({
          id: 2,
          base_type: "type/Integer",
        }),
      ],
    });

    const field1 = checkNotNull(metadata.field(1));
    const field2 = checkNotNull(metadata.field(2));

    describe("fields source", () => {
      it("should show a message about missing field values", async () => {
        await setup({
          parameter: createMockUiParameter({
            type: "number/=",
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

      it("should not show the option for connected fields if there are none", async () => {
        await setup({
          parameter: createMockUiParameter({
            type: "number/=",
            values_source_type: "static-list",
          }),
          parameterValues: createMockParameterValues({
            values: [],
          }),
        });
        expect(
          screen.queryByText("From connected fields"),
        ).not.toBeInTheDocument();
      });

      it("should show field values", async () => {
        await setup({
          parameter: createMockUiParameter({
            type: "number/=",
            fields: [field1, field2],
          }),
          parameterValues: createMockParameterValues({
            values: [[1], [2], [3]],
          }),
        });

        expect(await screen.findByRole("textbox")).toHaveValue("1\n2\n3");
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

        expect(
          screen.getByRole("radio", { name: "Custom list" }),
        ).toBeChecked();
      });

      it("should copy field values when switching to custom list", async () => {
        await setup({
          parameter: createMockUiParameter({
            fields: [field1, field2],
            values_source_config: {
              values: [[1], [2]],
            },
          }),
          parameterValues: createMockParameterValues({
            values: [[3], [4]],
          }),
        });
        expect(await screen.findByRole("textbox")).toHaveValue("3\n4");

        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );
        expect(
          screen.getByRole("radio", { name: "Custom list" }),
        ).toBeChecked();
        expect(screen.getByRole("textbox")).toHaveValue("3\n4");
      });

      it("should not overwrite custom list values when field values are empty", async () => {
        await setup({
          parameter: createMockUiParameter({
            fields: [field1, field2],
            values_source_config: {
              values: [[1], [2]],
            },
          }),
          parameterValues: createMockParameterValues({
            values: [],
          }),
        });
        expect(
          await screen.findByText(/We don’t have any cached values/),
        ).toBeInTheDocument();

        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );
        expect(
          screen.getByRole("radio", { name: "Custom list" }),
        ).toBeChecked();
        expect(screen.getByRole("textbox")).toHaveValue("1\n2");
      });
    });

    describe("card source", () => {
      it("should not should the card source for number parameters", async () => {
        await setup({
          parameter: createMockUiParameter({
            type: "number/=",
            values_source_type: "static-list",
          }),
          cards: [],
        });

        expect(
          screen.queryByText("From another model or question"),
        ).not.toBeInTheDocument();
      });
    });

    describe("list source", () => {
      it("should set static list values", async () => {
        const { onSubmit } = await setup();

        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );
        await userEvent.type(screen.getByRole("textbox"), "1\n2");
        await userEvent.click(screen.getByRole("button", { name: "Done" }));

        expect(onSubmit).toHaveBeenCalledWith("static-list", {
          values: [["1"], ["2"]],
        });
      });

      it("should preserve the list when changing the source type", async () => {
        await setup({
          parameter: createMockUiParameter({
            fields: [field1],
            values_source_type: "static-list",
            values_source_config: {
              values: [[1], [2]],
            },
          }),
        });

        await userEvent.click(
          screen.getByRole("radio", { name: "From connected fields" }),
        );
        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );

        expect(screen.getByRole("textbox")).toHaveValue("1\n2");
      });

      it("should render a hint about using models when labels are used", async () => {
        await setup({
          showMetabaseLinks: true,
          parameter: createMockUiParameter({
            fields: [field1],
            values_source_type: "static-list",
            values_source_config: {
              values: [[1, "Label"], [2]],
            },
          }),
        });

        await userEvent.click(
          screen.getByRole("radio", { name: "From connected fields" }),
        );
        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );

        expect(screen.getByRole("textbox")).toHaveValue("1, Label\n2");
        expect(screen.getByText("do it once in a model")).toBeInTheDocument();
        expect(screen.getByText("do it once in a model").tagName).toBe("A");
      });

      it("should render a hint about using models when labels are used, but without link when `show-metabase-links: false`", async () => {
        await setup({
          showMetabaseLinks: false,
          parameter: createMockUiParameter({
            fields: [field1],
            values_source_type: "static-list",
            values_source_config: {
              values: [[1, "Label"], [2]],
            },
          }),
        });

        await userEvent.click(
          screen.getByRole("radio", { name: "From connected fields" }),
        );
        await userEvent.click(
          screen.getByRole("radio", { name: "Custom list" }),
        );

        expect(screen.getByRole("textbox")).toHaveValue("1, Label\n2");
        expect(screen.getByText("do it once in a model")).toBeInTheDocument();
        expect(screen.getByText("do it once in a model").tagName).not.toBe("A");
      });
    });
  });
});

interface SetupOpts {
  parameter?: UiParameter;
  parameterValues?: ParameterValues;
  cards?: Card[];
  hasCollectionAccess?: boolean;
  hasParameterValuesError?: boolean;
  showMetabaseLinks?: boolean;
}

const setup = async ({
  parameter = createMockUiParameter(),
  parameterValues = createMockParameterValues(),
  cards = [],
  hasCollectionAccess = true,
  hasParameterValuesError = false,
  showMetabaseLinks = true,
}: SetupOpts = {}) => {
  const currentUser = createMockUser();
  const databases = [createMockDatabase()];
  const rootCollection = createMockCollection(ROOT_COLLECTION);
  const personalCollection = createMockCollection({
    id: currentUser.personal_collection_id,
  });
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  setupDatabasesEndpoints(databases);
  setupSearchEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([]);
  setupCollectionByIdEndpoint({
    collections: [personalCollection],
  });
  setupCollectionItemsEndpoint({
    collection: personalCollection,
    collectionItems: [],
  });

  if (hasCollectionAccess) {
    setupCollectionsEndpoints({ collections: [rootCollection] });
    setupCardsEndpoints(cards);
    cards.forEach(card =>
      setupTableQueryMetadataEndpoint(
        createMockTable({
          id: `card__${card.id}`,
          fields: card.result_metadata,
        }),
      ),
    );
  } else {
    setupUnauthorizedCollectionsEndpoints([rootCollection]);
    setupUnauthorizedCardsEndpoints(cards);
  }

  if (!hasParameterValuesError) {
    setupParameterValuesEndpoints(parameterValues);
  } else {
    setupErrorParameterValuesEndpoints();
  }

  if (!showMetabaseLinks) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <ValuesSourceModal
      parameter={parameter}
      onSubmit={onSubmit}
      onClose={onClose}
    />,
    {
      storeInitialState: createMockState({
        currentUser,
        settings: mockSettings({
          "show-metabase-links": showMetabaseLinks,
          "token-features": createMockTokenFeatures({ whitelabel: true }),
        }),
      }),
    },
  );

  await waitForLoaderToBeRemoved();

  return { onSubmit };
};
