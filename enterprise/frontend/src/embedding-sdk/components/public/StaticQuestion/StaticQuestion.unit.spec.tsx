import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupUnauthorizedCardEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { createMockAuthProviderUriConfig } from "embedding-sdk/test/mocks/config";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockParameter,
} from "metabase-types/api/mocks";

import type { StaticQuestionProps } from "./";
import { StaticQuestion } from "./";

const TEST_QUESTION_ID = 1;
const TEST_COLUMN = createMockColumn({
  display_name: "Test Column",
  name: "Test Column",
});
const TEST_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [TEST_COLUMN],
    rows: [["Test Row"]],
  }),
});
const TEST_PARAM = createMockParameter({
  type: "number/=",
  slug: "product_id",
  target: ["variable", ["template-tag", "product_id"]],
});

const VISUALIZATION_TYPES: Record<
  string,
  {
    container: string;
    button: string;
  }
> = {
  Table: { container: "Table-container", button: "Table-button" },
  Number: {
    container: "Number-container",
    button: "Number-button",
  },
  Gauge: {
    container: "Gauge-container",
    button: "Gauge-button",
  },
  Detail: {
    container: "Detail-container",
    button: "Detail-button",
  },
  Progress: {
    container: "Progress-container",
    button: "Progress-button",
  },
};

const setup = ({
  withChartTypeSelector = false,
  isValidCard = true,
  card = createMockCard(),
  initialSqlParameters,
}: Partial<StaticQuestionProps> & {
  card?: Card;
  isValidCard?: boolean;
} = {}) => {
  if (isValidCard) {
    setupCardEndpoints(card);
  } else {
    setupUnauthorizedCardEndpoints(card);
  }

  setupCardQueryEndpoints(card, TEST_DATASET);

  return renderWithProviders(
    <StaticQuestion
      questionId={TEST_QUESTION_ID}
      withChartTypeSelector={withChartTypeSelector}
      initialSqlParameters={initialSqlParameters}
    />,
    {
      mode: "sdk",
      sdkProviderProps: {
        config: createMockAuthProviderUriConfig({
          authProviderUri: "http://TEST_URI/sso/metabase",
        }),
      },
    },
  );
};

describe("StaticQuestion", () => {
  it("should render a loader on initialization", () => {
    setup();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("should render question if question is valid", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(
      within(screen.getByTestId("header-cell")).getByText(TEST_COLUMN.name),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("gridcell")).getByText("Test Row"),
    ).toBeInTheDocument();
  });

  it("should render an error if a question isn't found", async () => {
    setup({ isValidCard: false });
    await waitForLoaderToBeRemoved();
    expect(
      screen.getByText("You don't have permissions to do that."),
    ).toBeInTheDocument();
  });

  it("should render a visualization selector if withChartTypeSelector is true", async () => {
    setup({ withChartTypeSelector: true });
    await waitForLoaderToBeRemoved();
    expect(screen.getByTestId("chart-type-settings")).toBeInTheDocument();
  });

  it("should not render a visualization selector if withChartTypeSelector is false", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.queryByTestId("chart-type-settings")).not.toBeInTheDocument();
  });

  it("should change the visualization if a different visualization is selected", async () => {
    setup({ withChartTypeSelector: true });
    await waitForLoaderToBeRemoved();
    expect(screen.getByTestId("chart-type-settings")).toBeInTheDocument();

    for (const visType of Object.keys(VISUALIZATION_TYPES)) {
      await userEvent.click(
        screen.getByTestId(VISUALIZATION_TYPES[visType].button),
      );

      expect(
        screen.getByTestId(VISUALIZATION_TYPES[visType].container),
      ).toHaveAttribute("aria-selected", "true");
    }
  });

  it("should query with the parameters in a parameterized question", async () => {
    const card = createMockCard({ parameters: [TEST_PARAM] });
    setup({ card, initialSqlParameters: { product_id: 1024 } });

    await waitForLoaderToBeRemoved();

    const lastQuery = fetchMock.lastCall(`path:/api/card/${card.id}/query`);
    const queryRequest = await lastQuery?.request?.json();

    expect(queryRequest.parameters?.[0]).toMatchObject({
      id: TEST_PARAM.id,
      type: TEST_PARAM.type,
      target: TEST_PARAM.target,
      value: 1024,
    });
  });

  it("should cancel the request when the component unmounts", async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, "abort");

    const { unmount } = setup();
    await act(async () => unmount());

    // two requests should've been made initially
    expect(fetchMock.calls(`path:/api/card/1`).length).toBe(1);
    expect(fetchMock.calls(`path:/api/card/1/query`).length).toBe(1);

    // consequently, two abort calls should've been made for the two requests
    expect(abortSpy).toHaveBeenCalledTimes(2);
    abortSpy.mockRestore();
  });
});
