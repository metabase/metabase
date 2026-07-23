import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { makeMockSelection } from "metabase/explorations/test-utils";
import { Button } from "metabase/ui";
import type {
  ExplorationDimensionGroup,
  GetExplorationDataResponse,
} from "metabase-types/api";

import { AddDimensionsModal } from "./AddDimensionsModal";

const dateGroup: ExplorationDimensionGroup = {
  name: "Created At",
  dimension_interestingness: 0.9,
  dimensions: [
    {
      id: "created_at",
      name: "Created At",
      display_name: "Created At",
      effective_type: "type/DateTime",
      semantic_type: null,
    },
  ],
};

const categoryGroup: ExplorationDimensionGroup = {
  name: "Category",
  dimension_interestingness: 0.5,
  dimensions: [
    {
      id: "category",
      name: "Category",
      display_name: "Category",
      effective_type: "type/Text",
      semantic_type: null,
    },
  ],
};

function setupEndpoint(dimensionGroups: ExplorationDimensionGroup[]) {
  const response: GetExplorationDataResponse = {
    metrics: [],
    dimension_groups: dimensionGroups,
  };
  fetchMock.get("path:/api/exploration/dimensions", response);
}

function renderModal(opened: boolean) {
  return renderWithProviders(
    <AddDimensionsModal
      opened={opened}
      onClose={jest.fn()}
      selection={makeMockSelection()}
    />,
  );
}

// Mirrors the parent: the modal stays mounted and its `opened` prop is toggled,
// with closing routed through `onClose` (as Escape/backdrop/Add all do).
function Harness() {
  const [opened, setOpened] = useState(true);
  return (
    <>
      <Button onClick={() => setOpened(true)}>reopen</Button>
      <AddDimensionsModal
        opened={opened}
        onClose={() => setOpened(false)}
        selection={makeMockSelection()}
      />
    </>
  );
}

describe("AddDimensionsModal", () => {
  beforeAll(() => {
    mockGetBoundingClientRect({ height: 600, width: 600 });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("shows type tabs when more than one dimension type is present", async () => {
    setupEndpoint([dateGroup, categoryGroup]);
    renderModal(true);

    expect(await screen.findByText("Created At")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Date" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Category" })).toBeInTheDocument();
  });

  it("resets the selected tab to All after the modal is closed and reopened", async () => {
    setupEndpoint([dateGroup, categoryGroup]);
    renderWithProviders(<Harness />);

    expect(await screen.findByText("Created At")).toBeInTheDocument();

    // Select a non-default tab.
    await userEvent.click(screen.getByRole("tab", { name: "Date" }));
    expect(screen.getByRole("tab", { name: "Date" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Close via Escape (routes through onClose), then reopen.
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "reopen" }));

    expect(await screen.findByText("Created At")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Date" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });
});
