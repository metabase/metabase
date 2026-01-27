import userEvent from "@testing-library/user-event";
import { push } from "react-router-redux";

import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type { TransformRun, TransformTag } from "metabase-types/api";
import {
  createMockTransform,
  createMockTransformRun,
} from "metabase-types/api/mocks";

import { RunList } from "./RunList";

jest.mock("react-router-redux", () => ({
  ...jest.requireActual("react-router-redux"),
  push: jest.fn().mockReturnValue({ type: "@@router/CALL_HISTORY_METHOD" }),
}));

const pushMock = push as jest.MockedFunction<typeof push>;

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
  pushMock.mockClear();
  renderWithProviders(
    <RunList runs={runs} tags={tags} totalCount={totalCount} params={{}} />,
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
    setup({ runs: [run] });

    const row = screen.getByRole("row", { name: /Test Transform/ });
    await userEvent.click(row);

    expect(pushMock).toHaveBeenCalledWith(Urls.transform(123));
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
      setup({ runs: [run] });

      const row = screen.getByRole("row", { name: /Deleted Transform/ });
      await userEvent.click(row);

      expect(pushMock).not.toHaveBeenCalled();
    });
  });
});
