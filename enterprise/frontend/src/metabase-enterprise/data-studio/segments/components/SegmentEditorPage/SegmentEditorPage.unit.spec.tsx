import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import type { Segment, Table } from "metabase-types/api";
import { createMockSegment, createMockTable } from "metabase-types/api/mocks";

import { SegmentEditorPage } from "./SegmentEditorPage";

const mockRoute = {
  path: "/",
};

type SetupOpts = {
  segment?: Segment;
  table?: Table;
  isSaving?: boolean;
  isRemoving?: boolean;
  onRemove?: () => void;
};

function setup({
  segment,
  table = createMockTable({
    id: 42,
    db_id: 1,
    display_name: "Orders",
    schema: "PUBLIC",
  }),
  isSaving = false,
  isRemoving = false,
  onRemove,
}: SetupOpts = {}) {
  const onSave = jest.fn();
  const onCancel = jest.fn();
  const onRemoveFn = onRemove ?? jest.fn();

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <SegmentEditorPage
          segment={segment}
          table={table}
          route={mockRoute as any}
          isSaving={isSaving}
          isRemoving={isRemoving}
          onSave={onSave}
          onCancel={onCancel}
          onRemove={segment ? onRemoveFn : undefined}
          testId="segment-editor"
        />
      )}
    />,
    { withRouter: true },
  );

  return { onSave, onCancel, onRemove: onRemoveFn };
}

describe("SegmentEditorPage", () => {
  it("renders new segment form with name placeholder, description, back link, and no menu", () => {
    setup({ segment: undefined });

    expect(screen.getByPlaceholderText("New segment")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Give it a description"),
    ).toBeInTheDocument();
    expect(screen.getByText("Orders segments")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /segment actions/i }),
    ).not.toBeInTheDocument();
  });

  it("renders existing segment with name, description, and more menu", () => {
    const segment = createMockSegment({
      id: 1,
      name: "High Value",
      description: "Premium customers",
    });
    setup({ segment, onRemove: jest.fn() });

    expect(screen.getByDisplayValue("High Value")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Premium customers")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /segment actions/i }),
    ).toBeInTheDocument();
  });

  it("links back to segments tab with correct URL", () => {
    setup({ segment: undefined });

    const backLink = screen.getByText("Orders segments").closest("a");
    expect(backLink).toHaveAttribute(
      "href",
      "/data-studio/data/database/1/schema/1:PUBLIC/table/42/segments",
    );
  });
});
