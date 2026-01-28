import { renderWithProviders, screen } from "__support__/ui";
import { createQuery } from "metabase-lib/test-helpers";

import { MeasureEditor } from "./MeasureEditor";

describe("MeasureEditor", () => {
  const query = createQuery();
  const description = "A sample description";
  const onQueryChange = jest.fn();
  const onDescriptionChange = jest.fn();

  it("renders editable inputs when not read-only", () => {
    renderWithProviders(
      <MeasureEditor
        query={query}
        description={description}
        onQueryChange={onQueryChange}
        onDescriptionChange={onDescriptionChange}
      />,
    );

    expect(screen.getByLabelText("Give it a description")).not.toHaveAttribute(
      "readonly",
    );
    expect(
      screen.getByText("Pick an aggregation function"),
    ).toBeInTheDocument();
  });

  it("shows description as plain text when read-only", () => {
    renderWithProviders(
      <MeasureEditor
        query={query}
        description={description}
        onQueryChange={onQueryChange}
        onDescriptionChange={onDescriptionChange}
        readOnly
      />,
    );

    expect(
      screen.queryByLabelText("Give it a description"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(
      screen.queryByText("Pick an aggregation function"),
    ).not.toBeInTheDocument();
  });
});
