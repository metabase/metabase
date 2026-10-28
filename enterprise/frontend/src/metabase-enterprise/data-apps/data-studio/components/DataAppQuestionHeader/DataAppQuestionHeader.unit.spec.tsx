import { renderWithProviders, screen } from "__support__/ui";
import { createMockCard, createMockDataApp } from "metabase-types/api/mocks";

import { DataAppQuestionHeader } from "./DataAppQuestionHeader";

function setup() {
  renderWithProviders(
    <DataAppQuestionHeader
      app={createMockDataApp({
        name: "order-desk",
        display_name: "Order desk",
      })}
      card={createMockCard({ id: 7, name: "Recent orders" })}
    />,
    { withRouter: true },
  );
}

describe("DataAppQuestionHeader", () => {
  it("links the breadcrumbs to the app and its questions", () => {
    setup();

    const breadcrumbs = screen.getByTestId("data-studio-breadcrumbs");
    expect(screen.getByRole("link", { name: "Data apps" })).toHaveAttribute(
      "href",
      "/data-studio/apps",
    );
    expect(screen.getByRole("link", { name: "Order desk" })).toHaveAttribute(
      "href",
      "/data-studio/apps/order-desk",
    );
    expect(screen.getByRole("link", { name: "Questions" })).toHaveAttribute(
      "href",
      "/data-studio/apps/order-desk/questions",
    );
    expect(breadcrumbs).toHaveTextContent("Recent orders");
  });
});
