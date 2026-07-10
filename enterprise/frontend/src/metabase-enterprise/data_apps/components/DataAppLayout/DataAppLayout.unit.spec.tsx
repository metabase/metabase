import { renderWithProviders, screen } from "__support__/ui";

import { DataAppLayout } from "./DataAppLayout";

describe("DataAppLayout", () => {
  it("renders the data-app content", () => {
    renderWithProviders(
      <DataAppLayout params={{ name: "sales" }}>
        <div>app content</div>
      </DataAppLayout>,
    );

    expect(screen.getByText("app content")).toBeInTheDocument();
  });
});
