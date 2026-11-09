import { findRequests } from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";
import {
  createMockNativeCard,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockTemplateTag,
} from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("PreviewQueryModal (OSS)", () => {
  it("should render help link when `show-metabase-links: true", async () => {
    setup({ showMetabaseLinks: true });

    expect(await screen.findByText("Query preview")).toBeInTheDocument();
    expect(
      await screen.findByText("Learn how to debug SQL errors"),
    ).toBeInTheDocument();
  });

  it("should render help link when `show-metabase-links: false", async () => {
    setup({ showMetabaseLinks: false });

    expect(await screen.findByText("Query preview")).toBeInTheDocument();
    expect(
      await screen.findByText("Learn how to debug SQL errors"),
    ).toBeInTheDocument();
  });

  it("should show the error when the query cannot be compiled", async () => {
    setup();

    expect(
      await screen.findByText("An error occurred in your query"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue(
      'Cannot run the query: missing required parameters: #{"value"}',
    );
  });

  it("should compile the query with the current parameter values", async () => {
    const tag = createMockTemplateTag({
      id: "category-tag",
      name: "category",
      "display-name": "Category",
      type: "text",
    });
    const card = createMockNativeCard({
      dataset_query: createMockNativeDatasetQuery({
        native: createMockNativeQuery({
          query: "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}}",
          "template-tags": { category: tag },
        }),
      }),
    });
    const compiledQuery = "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'";

    setup({
      card,
      parameterValues: { [tag.id]: "Gadget" },
      nativeQueryResponse: { query: compiledQuery, params: null },
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox")).toHaveValue(compiledQuery),
    );
    expect(
      screen.queryByText("An error occurred in your query"),
    ).not.toBeInTheDocument();
    const [request] = await findRequests("POST");
    expect(request.body).toMatchObject({
      parameters: [
        {
          id: tag.id,
          type: "string/=",
          target: ["variable", ["template-tag", "category"]],
          value: ["Gadget"],
        },
      ],
    });
  });
});
