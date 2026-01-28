import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import type { TransformRun, TransformTag } from "metabase-types/api";
import {
  createMockTransform,
  createMockTransformRun,
} from "metabase-types/api/mocks";

import { RunList } from "./RunList";

type SetupOpts = {
  runs?: TransformRun[];
  tags?: TransformTag[];
  totalCount?: number;
};

function setup({
  runs = [createMockTransformRun({ transform: createMockTransform() })],
  tags = [],
  totalCount = runs.length,
}: SetupOpts = {}) {
  return renderWithProviders(
    <>
      <Route
        path="/data-studio/transforms/runs"
        component={() => (
          <RunList
            params={{}}
            runs={runs}
            tags={tags}
            totalCount={totalCount}
          />
        )}
      />
      <Route
        path="/data-studio/transforms/:id"
        component={() => <div data-testid="transform-detail" />}
      />
    </>,
    {
      initialRoute: "/data-studio/transforms/runs",
      withRouter: true,
    },
  );
}

describe("RunList", () => {
  it("should render transform name", () => {
    const transform = createMockTransform({ name: "My Transform" });
    const run = createMockTransformRun({ transform });
    setup({ runs: [run] });

    expect(screen.getByText("My Transform")).toBeInTheDocument();
  });

  it("should navigate to transform detail when clicking a row", async () => {
    const transform = createMockTransform({ id: 123, name: "Test Transform" });
    const run = createMockTransformRun({ transform });
    const { history } = setup({ runs: [run] });

    const row = screen.getByRole("row", { name: /Test Transform/ });
    await userEvent.click(row);

    expect(history?.getCurrentLocation()?.pathname).toBe(
      "/data-studio/transforms/123",
    );
    expect(screen.getByTestId("transform-detail")).toBeInTheDocument();
  });

  describe("deleted transforms", () => {
    it("should show deleted indicator for deleted transforms", () => {
      const transform = createMockTransform({
        name: "Deleted Transform",
        deleted: true,
      });
      const run = createMockTransformRun({ transform });
      setup({ runs: [run] });

      expect(screen.getByText("Deleted Transform")).toBeInTheDocument();
    });

    it("should not navigate when clicking a row with deleted transform", async () => {
      const transform = createMockTransform({
        id: 456,
        name: "Deleted Transform",
        deleted: true,
      });
      const run = createMockTransformRun({ transform });
      const { history } = setup({ runs: [run] });

      const row = screen.getByRole("row", { name: /Deleted Transform/ });
      await userEvent.click(row);

      expect(history?.getCurrentLocation()?.pathname).toBe(
        "/data-studio/transforms/runs",
      );
      expect(screen.queryByTestId("transform-detail")).not.toBeInTheDocument();
    });
  });
});
