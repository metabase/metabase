import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { getIcon, renderWithProviders, screen, within } from "__support__/ui";
import { METAKEY } from "metabase/lib/browser";
import type { IconName } from "metabase/ui";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findAggregationOperator,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { CardType } from "metabase-types/api";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";
import {
  createMockEmbedState,
  createMockState,
} from "metabase-types/store/mocks";

import { DEFAULT_QUESTION, createMockNotebookStep } from "../../test-utils";
import type { NotebookStep } from "../../types";
import { NotebookProvider } from "../Notebook/context";

import { DataStep } from "./DataStep";

const createQueryWithFields = (columnNames: string[]) => {
  const query = createQuery();
  const findColumn = columnFinder(query, Lib.fieldableColumns(query, 0));
  const columns = columnNames.map(name => findColumn("ORDERS", name));
  return Lib.withFields(query, 0, columns);
};

const createQueryWithAggregation = () => {
  const query = createQuery();
  const count = findAggregationOperator(query, "count");
  const aggregation = Lib.aggregationClause(count);
  return Lib.aggregate(query, 0, aggregation);
};

const createQueryWithBreakout = () => {
  const query = createQuery();
  const columns = Lib.breakoutableColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  const column = findColumn("ORDERS", "TAX");
  return Lib.breakout(query, 0, column);
};

interface SetupOpts {
  step?: NotebookStep;
  readOnly?: boolean;
  isEmbeddingSdk?: boolean;
}

const setup = ({
  step = createMockNotebookStep(),
  readOnly = false,
  isEmbeddingSdk = false,
}: SetupOpts = {}) => {
  const mockWindowOpen = jest.spyOn(window, "open").mockImplementation();

  const updateQuery = jest.fn();
  setupDatabasesEndpoints([createSampleDatabase()]);
  setupSearchEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);

  const storeInitialState = createMockState({
    embed: createMockEmbedState({ isEmbeddingSdk }),
  });

  renderWithProviders(
    <NotebookProvider>
      <DataStep
        step={step}
        query={step.query}
        stageIndex={step.stageIndex}
        readOnly={readOnly}
        color="brand"
        isLastOpened={false}
        reportTimezone="UTC"
        updateQuery={updateQuery}
      />
    </NotebookProvider>,
    { storeInitialState },
  );

  const getNextQuery = (): Lib.Query => {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0];
  };

  const getNextTableName = () => {
    const query = getNextQuery();
    const [sampleColumn] = Lib.visibleColumns(query, 0);
    return Lib.displayInfo(query, 0, sampleColumn).table?.displayName;
  };

  const getNextColumn = (columnName: string) => {
    const nextQuery = getNextQuery();
    const nextFields = Lib.fieldableColumns(nextQuery, 0);
    const findColumn = columnFinder(nextQuery, nextFields);
    const column = findColumn("ORDERS", columnName);
    return Lib.displayInfo(nextQuery, 0, column);
  };

  return { getNextQuery, getNextTableName, getNextColumn, mockWindowOpen };
};

const setupEmptyQuery = () => {
  const question = Question.create({ databaseId: SAMPLE_DB_ID });
  const query = question.query();
  return setup({ step: createMockNotebookStep({ query }) });
};

describe("DataStep", () => {
  const scrollBy = HTMLElement.prototype.scrollBy;
  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  beforeAll(() => {
    HTMLElement.prototype.scrollBy = jest.fn();
    // needed for @tanstack/react-virtual, see https://github.com/TanStack/virtual/issues/29#issuecomment-657519522
    HTMLElement.prototype.getBoundingClientRect = jest
      .fn()
      .mockReturnValue({ height: 1, width: 1 });
  });

  afterAll(() => {
    HTMLElement.prototype.scrollBy = scrollBy;
    HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;

    jest.resetAllMocks();
  });

  it("should render without a table selected", async () => {
    setupEmptyQuery();

    const modal = await screen.findByTestId("entity-picker-modal");
    expect(
      await within(modal).findByText("Pick your starting data"),
    ).toBeInTheDocument();

    // Ensure the table picker not open
    expect(await within(modal).findByText("Orders")).toBeInTheDocument();
    expect(await within(modal).findByText("Products")).toBeInTheDocument();
    expect(await within(modal).findByText("People")).toBeInTheDocument();
  });

  it("should render with a selected table", () => {
    setup();

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(getIcon("table")).toBeInTheDocument();

    expect(
      screen.queryByText("Pick your starting data"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();
    expect(screen.queryByText("Products")).not.toBeInTheDocument();
    expect(screen.queryByText("People")).not.toBeInTheDocument();
  });

  it.each<{ type: CardType; icon: IconName }>([
    { type: "question", icon: "table2" },
    { type: "model", icon: "model" },
  ])("should render with a selected card", ({ type, icon }) => {
    const card = createSavedStructuredCard({
      id: 1,
      type,
    });
    const metadata = createMockMetadata({
      databases: [createSampleDatabase()],
      questions: [card],
    });
    const metadataProvider = Lib.metadataProvider(SAMPLE_DB_ID, metadata);
    const query = Lib.queryFromTableOrCardMetadata(
      metadataProvider,
      Lib.tableOrCardMetadata(metadataProvider, `card__${card.id}`),
    );
    const step = createMockNotebookStep({ query });
    setup({ step });

    expect(screen.getByText(card.name)).toBeInTheDocument();
    expect(getIcon(icon)).toBeInTheDocument();
  });

  it("should change a table", async () => {
    const { getNextTableName } = setup();

    await userEvent.click(screen.getByText("Orders"));
    await userEvent.click(await screen.findByText("Products"));

    expect(getNextTableName()).toBe("Products");
  });

  describe("fields selection", () => {
    it("should render with all columns selected", async () => {
      setup();
      await userEvent.click(screen.getByLabelText("Pick columns"));

      expect(screen.getByLabelText("Select none")).toBeChecked();
      expect(screen.getByLabelText("ID")).toBeChecked();
      expect(screen.getByLabelText("ID")).toBeEnabled();
      expect(screen.getByLabelText("Tax")).toBeChecked();
      expect(screen.getByLabelText("Tax")).toBeEnabled();
    });

    it("should render with a single column selected", async () => {
      const query = createQueryWithFields(["ID"]);
      setup({ step: createMockNotebookStep({ query }) });
      await userEvent.click(screen.getByLabelText("Pick columns"));

      expect(screen.getByLabelText("Select all")).not.toBeChecked();
      expect(screen.getByLabelText("ID")).toBeChecked();
      expect(screen.getByLabelText("ID")).toBeDisabled();
      expect(screen.getByLabelText("Tax")).not.toBeChecked();
      expect(screen.getByLabelText("Tax")).toBeEnabled();
    });

    it("should render with multiple columns selected", async () => {
      const query = createQueryWithFields(["ID", "TOTAL"]);
      setup({ step: createMockNotebookStep({ query }) });
      await userEvent.click(screen.getByLabelText("Pick columns"));

      expect(screen.getByLabelText("Select all")).not.toBeChecked();
      expect(screen.getByLabelText("ID")).toBeChecked();
      expect(screen.getByLabelText("ID")).toBeEnabled();
      expect(screen.getByLabelText("Tax")).not.toBeChecked();
      expect(screen.getByLabelText("Tax")).toBeEnabled();
      expect(screen.getByLabelText("Total")).toBeChecked();
      expect(screen.getByLabelText("Total")).toBeEnabled();
    });

    it("should allow selecting a column", async () => {
      const query = createQueryWithFields(["ID"]);
      const step = createMockNotebookStep({ query });
      const { getNextColumn } = setup({ step });

      await userEvent.click(screen.getByLabelText("Pick columns"));
      await userEvent.click(screen.getByLabelText("Tax"));

      expect(getNextColumn("ID").selected).toBeTruthy();
      expect(getNextColumn("TAX").selected).toBeTruthy();
      expect(getNextColumn("TOTAL").selected).toBeFalsy();
    });

    it("should allow de-selecting a column", async () => {
      const { getNextColumn } = setup();

      await userEvent.click(screen.getByLabelText("Pick columns"));
      await userEvent.click(screen.getByLabelText("Tax"));

      expect(getNextColumn("ID").selected).toBeTruthy();
      expect(getNextColumn("TAX").selected).toBeFalsy();
      expect(getNextColumn("TOTAL").selected).toBeTruthy();
    });

    it("should allow selecting all columns", async () => {
      const query = createQueryWithFields(["ID"]);
      const step = createMockNotebookStep({ query });
      const { getNextColumn } = setup({ step });

      await userEvent.click(screen.getByLabelText("Pick columns"));
      await userEvent.click(screen.getByLabelText("Select all"));

      expect(getNextColumn("ID").selected).toBeTruthy();
      expect(getNextColumn("TAX").selected).toBeTruthy();
      expect(getNextColumn("TOTAL").selected).toBeTruthy();
    });

    it("should leave one column when de-selecting all columns", async () => {
      const { getNextQuery } = setup();

      await userEvent.click(screen.getByLabelText("Pick columns"));
      await userEvent.click(screen.getByLabelText("Select none"));

      const nextQuery = getNextQuery();
      expect(Lib.fields(nextQuery, 0)).toHaveLength(1);
    });

    it("should not display fields picker in read-only mode", () => {
      setup({ readOnly: true });
      expect(screen.queryByLabelText("Pick columns")).not.toBeInTheDocument();
    });

    it("should not display fields picker until a table is selected", () => {
      setupEmptyQuery();
      expect(screen.queryByLabelText("Pick columns")).not.toBeInTheDocument();
    });

    it("should not display fields picker if a query has aggregations", () => {
      const query = createQueryWithAggregation();
      const step = createMockNotebookStep({ query });
      setup({ step });

      expect(screen.queryByLabelText("Pick columns")).not.toBeInTheDocument();
    });

    it("should not display fields picker if a query has breakouts", () => {
      const query = createQueryWithBreakout();
      const step = createMockNotebookStep({ query });
      setup({ step });

      expect(screen.queryByLabelText("Pick columns")).not.toBeInTheDocument();
    });
  });

  describe("link to data source", () => {
    it("should show the tooltip on hover", async () => {
      setup();

      await userEvent.hover(screen.getByText("Orders"));
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        `${METAKEY}+click to open in new tab`,
      );
    });

    it("should not show the tooltip when there is no table selected", async () => {
      setupEmptyQuery();

      const modal = await screen.findByTestId("entity-picker-modal");
      const closeButton = await screen.findByRole("button", { name: /close/i });

      await userEvent.click(closeButton);
      expect(modal).not.toBeInTheDocument();

      await userEvent.hover(screen.getByText("Pick your starting data"));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("meta click should open the data source in a new window", () => {
      const { mockWindowOpen } = setup();

      const dataSource = screen.getByText("Orders");
      fireEvent.click(dataSource, { metaKey: true });

      expect(mockWindowOpen).toHaveBeenCalledTimes(1);
      mockWindowOpen.mockClear();
    });

    it("ctrl click should open the data source in a new window", () => {
      const { mockWindowOpen } = setup();

      const dataSource = screen.getByText("Orders");
      fireEvent.click(dataSource, { ctrlKey: true });

      expect(mockWindowOpen).toHaveBeenCalledTimes(1);
      mockWindowOpen.mockClear();
    });

    it("middle click should open the data source in a new window", () => {
      const { mockWindowOpen } = setup();

      const dataSource = screen.getByText("Orders");
      const middleClick = new MouseEvent("auxclick", {
        bubbles: true,
        button: 1,
      });

      fireEvent(dataSource, middleClick);

      expect(mockWindowOpen).toHaveBeenCalledTimes(1);
      mockWindowOpen.mockClear();
    });

    it("regular click should open the entity picker", async () => {
      const { mockWindowOpen } = setup();

      const dataSource = screen.getByText("Orders");

      fireEvent.click(dataSource);

      expect(
        await screen.findByTestId("entity-picker-modal"),
      ).toBeInTheDocument();
      expect(mockWindowOpen).not.toHaveBeenCalled();
    });

    describe("embedding SDK context", () => {
      it("should not show the tooltip", async () => {
        setup({ isEmbeddingSdk: true });

        await userEvent.hover(screen.getByText("Orders"));
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      });

      it.each([{ metaKey: true }, { ctrlKey: true }])(
        "meta/ctrl click should not open the data source",
        async clickConfig => {
          const { mockWindowOpen } = setup({
            isEmbeddingSdk: true,
          });

          const dataSource = screen.getByText("Orders");
          fireEvent.click(dataSource, clickConfig);

          expect(await screen.findByText("Products")).toBeInTheDocument();
          expect(mockWindowOpen).not.toHaveBeenCalled();
          mockWindowOpen.mockClear();
        },
      );

      it("middle click should not open the data source", async () => {
        const { mockWindowOpen } = setup({
          isEmbeddingSdk: true,
        });

        const dataSource = screen.getByText("Orders");
        const middleClick = new MouseEvent("auxclick", {
          bubbles: true,
          button: 1,
        });
        fireEvent(dataSource, middleClick);

        expect(mockWindowOpen).not.toHaveBeenCalled();
        mockWindowOpen.mockClear();
      });
    });
  });

  describe("metrics", () => {
    it("should automatically aggregate by count for metrics", async () => {
      const step = createMockNotebookStep({
        question: DEFAULT_QUESTION.setType("metric"),
      });
      const { getNextQuery } = setup({ step });

      await userEvent.click(screen.getByText("Orders"));
      await userEvent.click(await screen.findByText("Products"));

      const { stageIndex } = step;
      const nextQuery = getNextQuery();
      const nextAggregations = Lib.aggregations(nextQuery, stageIndex);
      expect(nextAggregations).toHaveLength(1);
      expect(
        Lib.displayInfo(nextQuery, stageIndex, nextAggregations[0]),
      ).toMatchObject({
        displayName: "Count",
      });
    });

    it("should not automatically aggregate by count for non-metrics", async () => {
      const step = createMockNotebookStep();
      const { getNextQuery } = setup({ step });

      await userEvent.click(screen.getByText("Orders"));
      await userEvent.click(await screen.findByText("Products"));

      const { stageIndex } = step;
      const nextQuery = getNextQuery();
      const nextAggregations = Lib.aggregations(nextQuery, stageIndex);
      expect(nextAggregations).toHaveLength(0);
    });
  });
});
