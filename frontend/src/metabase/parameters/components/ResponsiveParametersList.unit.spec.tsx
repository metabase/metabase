import {
  createMockMediaQueryList,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { CardId, Parameter } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import { ResponsiveParametersList } from "./ResponsiveParametersList";

type SetupOpts = {
  cardId?: CardId;
  parameters?: Parameter[];
  enableParameterRequiredBehavior?: boolean;
};

function setup({
  cardId,
  parameters = [],
  enableParameterRequiredBehavior = false,
}: SetupOpts) {
  const setParameterValue = jest.fn();
  const setParameterIndex = jest.fn();

  renderWithProviders(
    <ResponsiveParametersList
      cardId={cardId}
      parameters={parameters}
      enableParameterRequiredBehavior={enableParameterRequiredBehavior}
      setParameterValue={setParameterValue}
      setParameterIndex={setParameterIndex}
    />,
  );

  return { setParameterValue, setParameterIndex };
}

describe("ResponsiveParametersList", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("small screens", () => {
    beforeEach(() => {
      jest
        .spyOn(window, "matchMedia")
        .mockReturnValue(createMockMediaQueryList({ matches: true }));
    });

    it("should show the filter button when there are parameters", () => {
      setup({ parameters: [createMockParameter()] });
      expect(
        screen.getByRole("button", { name: /Filters/ }),
      ).toBeInTheDocument();
    });

    it("should count the active filters and render their widgets", () => {
      setup({
        parameters: [
          createMockParameter({ id: "1", name: "Category", value: "Gizmo" }),
          createMockParameter({ id: "2", name: "Vendor" }),
        ],
      });

      expect(
        screen.getByRole("button", { name: /1 active filter/ }),
      ).toBeInTheDocument();
      expect(screen.getByText("Gizmo")).toBeInTheDocument();
      expect(screen.getByText("Vendor")).toBeInTheDocument();
    });

    it("should not show the filter button when there are no parameters", () => {
      setup({ parameters: [] });
      expect(
        screen.queryByRole("button", { name: /Filters/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("large screens", () => {
    beforeEach(() => {
      jest
        .spyOn(window, "matchMedia")
        .mockReturnValue(createMockMediaQueryList({ matches: false }));
    });

    it("should not show the filter button for small screens when there are parameters", () => {
      setup({ parameters: [createMockParameter()] });
      expect(
        screen.queryByRole("button", { name: /Filters/ }),
      ).not.toBeInTheDocument();
    });
  });
});
