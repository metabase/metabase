import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createQuery,
  createQueryWithDefaultFilter,
  findUnknownColumn,
  storeInitialState,
} from "metabase/querying/components/FilterPicker/test-utils";
import * as Lib from "metabase-lib";

import { DefaultFilterPicker } from "./DefaultFilterPicker";

type SetupOpts = {
  query?: Lib.Query;
  stageIndex?: number;
  column?: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
};

function setup({
  query = createQuery(),
  stageIndex = -1,
  column = findUnknownColumn(query),
  filter,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <DefaultFilterPicker
      query={query}
      stageIndex={stageIndex}
      column={column}
      filter={filter}
      isNew={!filter}
      onChange={onChange}
      onBack={onBack}
    />,
    { storeInitialState },
  );

  function getNextFilterName() {
    const [filter] = onChange.mock.lastCall;
    return filter
      ? Lib.displayInfo(query, stageIndex, filter).displayName
      : null;
  }

  return {
    query,
    column,
    getNextFilterName,
    onChange,
    onBack,
  };
}

describe("DefaultFilterPicker", () => {
  describe("new filter", () => {
    it("should create a new filter with the initial operator", async () => {
      const { getNextFilterName } = setup();
      expect(screen.getByLabelText("Is empty")).toBeChecked();
      expect(screen.getByLabelText("Not empty")).not.toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
      expect(getNextFilterName()).toBe("Unknown is empty");
    });

    it("should create a new filter with 'is-empty' operator", async () => {
      const { getNextFilterName } = setup();
      await userEvent.click(screen.getByLabelText("Is empty"));
      expect(screen.getByLabelText("Is empty")).toBeChecked();
      expect(screen.getByLabelText("Not empty")).not.toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
      expect(getNextFilterName()).toBe("Unknown is empty");
    });

    it("should create a new filter with 'not-empty' operator", async () => {
      const { getNextFilterName } = setup();
      await userEvent.click(screen.getByLabelText("Not empty"));
      expect(screen.getByLabelText("Is empty")).not.toBeChecked();
      expect(screen.getByLabelText("Not empty")).toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
      expect(getNextFilterName()).toBe("Unknown is not empty");
    });

    it("should go back", async () => {
      const { onBack, onChange } = setup();
      await userEvent.click(screen.getByLabelText("Back"));
      expect(onBack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("existing filter", () => {
    it("should update a filter with 'is-empty' operator", async () => {
      const { getNextFilterName } = setup(
        createQueryWithDefaultFilter({
          operator: "is-null",
        }),
      );
      expect(screen.getByLabelText("Is empty")).toBeChecked();
      expect(screen.getByLabelText("Not empty")).not.toBeChecked();

      await userEvent.click(screen.getByLabelText("Not empty"));
      expect(screen.getByLabelText("Is empty")).not.toBeChecked();
      expect(screen.getByLabelText("Not empty")).toBeChecked();

      await userEvent.click(
        screen.getByRole("button", { name: "Update filter" }),
      );
      expect(getNextFilterName()).toBe("Unknown is not empty");
    });

    it("should update a filter with 'not-empty' operator", async () => {
      const { getNextFilterName } = setup(
        createQueryWithDefaultFilter({
          operator: "not-null",
        }),
      );
      expect(screen.getByLabelText("Is empty")).not.toBeChecked();
      expect(screen.getByLabelText("Not empty")).toBeChecked();

      await userEvent.click(screen.getByLabelText("Is empty"));
      expect(screen.getByLabelText("Is empty")).toBeChecked();
      expect(screen.getByLabelText("Not empty")).not.toBeChecked();

      await userEvent.click(
        screen.getByRole("button", { name: "Update filter" }),
      );
      expect(getNextFilterName()).toBe("Unknown is empty");
    });

    it("should go back", async () => {
      const { onBack, onChange } = setup(createQueryWithDefaultFilter());
      await userEvent.click(screen.getByLabelText("Back"));
      expect(onBack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
