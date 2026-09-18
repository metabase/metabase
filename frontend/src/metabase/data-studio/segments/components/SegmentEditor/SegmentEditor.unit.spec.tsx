import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { SegmentEditor } from "./SegmentEditor";

const MARKDOWN_DESCRIPTION = "A **bold** [link](https://metabase.com)";

function expectFormattedMarkdown() {
  expect(screen.getByText("bold").tagName).toBe("STRONG");
  expect(screen.getByRole("link", { name: "link" })).toHaveAttribute(
    "href",
    "https://metabase.com",
  );
}

describe("SegmentEditor", () => {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const description = "A sample description";
  const onQueryChange = jest.fn();
  const onDescriptionChange = jest.fn();

  it("renders editable inputs when not read-only", () => {
    renderWithProviders(
      <SegmentEditor
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
      screen.getByText("Add filters to narrow your answer"),
    ).toBeInTheDocument();
  });

  it("shows description when read-only", () => {
    renderWithProviders(
      <SegmentEditor
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
      screen.queryByText("Add filters to narrow your answer"),
    ).not.toBeInTheDocument();
  });

  it("renders markdown formatting when editable", () => {
    renderWithProviders(
      <SegmentEditor
        query={query}
        description={MARKDOWN_DESCRIPTION}
        onQueryChange={onQueryChange}
        onDescriptionChange={onDescriptionChange}
      />,
    );

    expectFormattedMarkdown();
  });

  it("renders markdown formatting when read-only", () => {
    renderWithProviders(
      <SegmentEditor
        query={query}
        description={MARKDOWN_DESCRIPTION}
        onQueryChange={onQueryChange}
        onDescriptionChange={onDescriptionChange}
        readOnly
      />,
    );

    expectFormattedMarkdown();
  });
});
