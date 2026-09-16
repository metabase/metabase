import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { ShownEntity } from "metabase/api/ai-streaming/schemas";
import type { Dataset, RawSeries } from "metabase-types/api";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import { AgentMessage } from "./MetabotChatMessage";
import { MetabotShownEntity } from "./MetabotShownEntity";

jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: ({ rawSeries }: { rawSeries: RawSeries }) => (
    <div data-testid="visualization">
      {JSON.stringify(rawSeries[0].card.visualization_settings)}
    </div>
  ),
}));

const card = createMockCard({
  id: 42,
  name: "Bird sightings",
  display: "bar",
  visualization_settings: { "graph.show_values": true },
});

function setup({
  value = {
    type: "question",
    id: card.id,
    title: card.name,
    url: "/question/42",
  },
  readonly = false,
  cardStatus,
  queryStatus,
  dataset = createMockDataset(),
  archived = false,
}: {
  value?: ShownEntity;
  readonly?: boolean;
  cardStatus?: number;
  queryStatus?: number;
  dataset?: Dataset;
  archived?: boolean;
} = {}) {
  setupCardEndpoints({ ...card, archived });
  if (cardStatus) {
    fetchMock.modifyRoute("card-42-get", { response: { status: cardStatus } });
  }
  if (queryStatus) {
    fetchMock.post("path:/api/card/42/query", { status: queryStatus });
  } else {
    setupCardQueryEndpoints(card, dataset);
  }
  return renderWithProviders(
    <MetabotShownEntity value={value} readonly={readonly} />,
  );
}

describe("MetabotShownEntity", () => {
  it("renders a persisted shown entity in a normal assistant reply", () => {
    renderWithProviders(
      <AgentMessage
        message={{
          id: "message-1",
          role: "agent",
          status: { type: "done" },
          parts: [
            {
              id: "part-1",
              role: "agent",
              type: "data_part",
              part: {
                type: "data-shown_entity",
                data: {
                  type: "dashboard",
                  id: 42,
                  title: "Bird dashboard",
                  url: "/dashboard/42",
                },
              },
            },
          ],
        }}
        debug={false}
        readonly
        hideActions
        submittedFeedback={undefined}
        conversationId="conversation-1"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Bird dashboard" }),
    ).toHaveAttribute("href", "/dashboard/42");
  });

  it("runs the saved question with its visualization settings and original link", async () => {
    setup();
    expect(await screen.findByTestId("visualization")).toHaveTextContent(
      '"graph.show_values":true',
    );
    expect(screen.getByRole("link", { name: card.name })).toHaveAttribute(
      "href",
      "/question/42",
    );
    expect(fetchMock.callHistory.called("path:/api/card/42/query")).toBe(true);
    expect(fetchMock.callHistory.called("path:/api/dataset")).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it.each(["model", "metric"] as const)("previews a saved %s", async (type) => {
    setup({
      value: { type, id: card.id, title: card.name, url: `/${type}/42` },
    });
    expect(await screen.findByTestId("visualization")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: card.name })).toHaveAttribute(
      "href",
      `/${type}/42`,
    );
  });

  it("waits for Run query in readonly history", async () => {
    setup({ readonly: true });
    expect(fetchMock.callHistory.called("path:/api/card/42/query")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Run query" }));
    expect(await screen.findByTestId("visualization")).toBeInTheDocument();
  });

  it.each(["dashboard", "document", "table"] as const)(
    "shows a %s link without running a query",
    (type) => {
      const url = type === "table" ? "/question#table-query" : `/${type}/42`;
      setup({ value: { type, id: 42, title: "Birds", url } });
      expect(screen.getByRole("link", { name: "Birds" })).toHaveAttribute(
        "href",
        url,
      );
      expect(fetchMock.callHistory.called("path:/api/card/42/query")).toBe(
        false,
      );
    },
  );

  it.each([403, 404])(
    "shows an unavailable item for a %s response",
    async (cardStatus) => {
      setup({ cardStatus });
      expect(
        await screen.findByText("This item is no longer available."),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
      expect(fetchMock.callHistory.called("path:/api/card/42/query")).toBe(
        false,
      );
    },
  );

  it("does not run an archived question", async () => {
    setup({ archived: true });
    expect(
      await screen.findByText("This item is no longer available."),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/card/42/query")).toBe(false);
  });

  it("shows query request failures inline", async () => {
    setup({ queryStatus: 500 });
    expect(
      await screen.findByText("There was a problem displaying this chart."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
  });

  it("shows query permission failures inline", async () => {
    setup({
      dataset: createMockDataset({
        error: "no access",
        error_type: "missing-required-permissions",
      }),
    });
    expect(
      await screen.findByText(
        "Sorry, you don't have permission to see this card.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
  });
});
