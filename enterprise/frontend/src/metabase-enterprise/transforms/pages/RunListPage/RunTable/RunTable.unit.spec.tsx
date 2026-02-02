import userEvent from "@testing-library/user-event";

import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { TransformRun } from "metabase-types/api";
import {
  createMockTransform,
  createMockTransformRun,
} from "metabase-types/api/mocks";

import { RunTable } from "./RunTable";

type SetupOpts = {
  runs?: TransformRun[];
};

function setup({ runs = [] }: SetupOpts = {}) {
  const onSortOptionsChange = jest.fn();
  const onSelect = jest.fn();
  mockGetBoundingClientRect({ width: 800, height: 600 });

  renderWithProviders(
    <RunTable
      runs={runs}
      tags={[]}
      hasFilters={false}
      sortOptions={undefined}
      onSortOptionsChange={onSortOptionsChange}
      onSelect={onSelect}
    />,
  );

  return { onSelect };
}

describe("RunTable", () => {
  it("should render transform name", async () => {
    const transform = createMockTransform({ name: "My Transform" });
    const run = createMockTransformRun({ transform });
    setup({ runs: [run] });

    expect(await screen.findByText("My Transform")).toBeInTheDocument();
  });

  it("should call onSelect when clicking a row", async () => {
    const transform = createMockTransform({ id: 123, name: "Test Transform" });
    const run = createMockTransformRun({ id: 456, transform });
    const { onSelect } = setup({ runs: [run] });

    const row = await screen.findByRole("row", { name: /Test Transform/ });
    await userEvent.click(row);

    expect(onSelect).toHaveBeenCalledWith(456);
  });

  describe("deleted transforms", () => {
    it("should show deleted indicator for deleted transforms", async () => {
      const transform = createMockTransform({
        name: "Deleted Transform",
        deleted: true,
      });
      const run = createMockTransformRun({ transform });
      setup({ runs: [run] });

      expect(await screen.findByText("Deleted Transform")).toBeInTheDocument();
    });

    it("should call onSelect when clicking a row with deleted transform", async () => {
      const transform = createMockTransform({
        id: 456,
        name: "Deleted Transform",
        deleted: true,
      });
      const run = createMockTransformRun({ id: 789, transform });
      const { onSelect } = setup({ runs: [run] });

      const row = await screen.findByRole("row", {
        name: /Deleted Transform/,
      });
      await userEvent.click(row);

      expect(onSelect).toHaveBeenCalledWith(789);
    });
  });
});
