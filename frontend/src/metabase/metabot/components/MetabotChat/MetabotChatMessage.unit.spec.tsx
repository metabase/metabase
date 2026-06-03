import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";
import { Route } from "react-router";

import {
  getScrollIntoViewMock,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { serializeCardForUrl } from "metabase/common/utils/card";
import type {
  MetabotAgentChatMessage,
  MetabotChatMessage,
} from "metabase/metabot/state";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { AgentMessage, Messages } from "./MetabotChatMessage";
import type { DataPointMentionTarget } from "./data-point-mentions";
import { routeDataPointMention } from "./data-point-router";

const mockSetPrompt = jest.fn();
const mockFocusPromptInput = jest.fn();
const mockSubmitInput = jest.fn();
let mockPrompt = "";
let mockQuestionDisplay = "bar";
let mockChatContextProvider: (() => Promise<unknown>) | undefined;
const mockQueryVisualizationRender = jest.fn();

jest.mock("metabase/metabot", () => ({
  useMetabotContext: () => ({}),
  useRegisterMetabotContextProvider: (provider: () => Promise<unknown>) => {
    mockChatContextProvider = provider;
  },
}));

jest.mock("metabase/metabot/hooks", () => ({
  useMetabotAgent: () => ({
    prompt: mockPrompt,
    setPrompt: mockSetPrompt,
    focusPromptInput: mockFocusPromptInput,
    submitInput: mockSubmitInput,
    isDoingScience: false,
  }),
}));

// The embedded question card reads/writes the prompt directly via the metabot
// state module (rather than subscribing to it through useMetabotAgent, which
// would re-render the embedded chart on every keystroke). Spy on those.
jest.mock("metabase/metabot/state", () => {
  const actual = jest.requireActual("metabase/metabot/state");
  return {
    ...actual,
    getPrompt: () => mockPrompt,
    submitInput: (payload: unknown) => {
      mockSubmitInput(payload);
      return { type: "test/submitInput", payload };
    },
    setPrompt: ({ prompt }: { prompt: string }) => {
      mockSetPrompt(prompt);
      return { type: "test/setPrompt", payload: { prompt } };
    },
    focusPromptInput: () => {
      mockFocusPromptInput();
      return { type: "test/focusPromptInput" };
    },
  };
});

const mockQuestion = {
  displayName: () => "Revenue by month",
  description: () => null,
  datasetQuery: () => ({ type: "query", database: 1, query: {} }),
  display: () => mockQuestionDisplay,
  card: () => ({
    display: mockQuestionDisplay,
    visualization_settings: {},
  }),
};

jest.mock("metabase/common/components/AdHocQuestionLoader", () => ({
  AdHocQuestionLoader: ({
    children,
  }: {
    children: (state: any) => JSX.Element;
  }) =>
    children({
      question: mockQuestion,
      loading: false,
      error: null,
    }),
}));

jest.mock("metabase/common/components/QuestionResultLoader", () => ({
  QuestionResultLoader: ({
    children,
  }: {
    children: (state: any) => JSX.Element;
  }) =>
    children({
      result: {
        data: {
          cols: [
            {
              name: "CREATED_AT",
              display_name: "Created At",
              base_type: "type/DateTime",
            },
            {
              name: "REVENUE",
              display_name: "Revenue",
              base_type: "type/Float",
            },
          ],
          rows: [["2026-01-01", 123]],
        },
      },
      rawSeries: [],
      loading: false,
      error: null,
    }),
}));

jest.mock("metabase/querying/components/QueryVisualization", () => ({
  QueryVisualization: ({
    clicked,
    clickedViaMention,
    handleVisualizationClick,
    onVisualizationRenderError,
  }: any) => {
    mockQueryVisualizationRender();

    return (
      <>
        <button
          data-testid="embedded-question"
          data-clicked={clicked ? "true" : "false"}
          data-clicked-via-mention={clickedViaMention ? "true" : "false"}
          onClick={() =>
            handleVisualizationClick?.({
              value: 123,
              column: {
                name: "REVENUE",
                display_name: "Revenue",
                base_type: "type/Float",
              },
              dimensions: [
                {
                  value: "2026-01-01",
                  column: {
                    name: "CREATED_AT",
                    display_name: "Created At",
                    base_type: "type/DateTime",
                  },
                },
              ],
              origin: {
                cols: [
                  {
                    name: "CREATED_AT",
                    display_name: "Created At",
                    base_type: "type/DateTime",
                  },
                  {
                    name: "REVENUE",
                    display_name: "Revenue",
                    base_type: "type/Float",
                  },
                ],
                row: ["2026-01-01", 123],
              },
            })
          }
        />
        <button
          data-testid="embedded-question-error"
          onClick={() =>
            onVisualizationRenderError?.(
              new Error("[plugin 4] blocked createElement: input"),
              { phase: "render", display: "custom:broken-viz" },
            )
          }
        />
      </>
    );
  },
}));

const setup = (
  message: MetabotAgentChatMessage,
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>,
) =>
  renderWithProviders(
    <AgentMessage
      agentId="omnibot"
      debug={false}
      readonly={false}
      hideActions
      setFeedbackMessage={() => {}}
      submittedFeedback={undefined}
      getCopyText={() => ""}
      message={message}
      dataPointTargets={dataPointTargets}
    />,
  );

describe("AgentMessage", () => {
  beforeEach(() => {
    mockPrompt = "";
    mockQuestionDisplay = "bar";
    mockSetPrompt.mockClear();
    mockFocusPromptInput.mockClear();
    mockQueryVisualizationRender.mockClear();
    mockSubmitInput.mockClear();
    mockChatContextProvider = undefined;
    jest
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("f10cfc50-2a0b-4c67-a064-7585d17974c7");
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders adhoc_viz responses as embedded question cards", () => {
    const cardHash = serializeCardForUrl({
      name: "Revenue by month",
      display: "bar",
      dataset_query: {
        type: "query",
        database: 1,
        query: {},
      },
    } as any);

    setup({
      id: "msg",
      role: "agent",
      type: "data_part",
      part: {
        type: "adhoc_viz",
        version: 1,
        value: {
          query: { type: "query", database: 1, query: {} },
          link: `/question#${cardHash}`,
          title: "Revenue by month",
          display: "bar",
        },
      },
    });

    expect(screen.getByText("Revenue by month")).toBeInTheDocument();
    expect(screen.getByTestId("embedded-question")).toBeInTheDocument();
    expect(screen.queryByText("Open in fullscreen")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Expand data sources" }),
    ).not.toBeInTheDocument();
  });

  it("expands the question card's data sources from the header toggle", async () => {
    fetchMock.get(
      "path:/api/table/2",
      createMockTable({
        id: 2,
        db_id: 1,
        name: "ORDERS",
        display_name: "Orders",
      }),
    );
    fetchMock.get(
      "path:/api/database/1",
      createMockDatabase({ id: 1, name: "Sample Database" }),
    );

    const cardHash = serializeCardForUrl({
      name: "Revenue by month",
      display: "bar",
      dataset_query: {
        type: "query",
        database: 1,
        query: { "source-table": 2 },
      },
    } as any);

    setup({
      id: "msg",
      externalId: "external-msg",
      role: "agent",
      type: "data_part",
      part: {
        type: "adhoc_viz",
        version: 1,
        value: {
          query: { type: "query", database: 1, query: { "source-table": 2 } },
          link: `/question#${cardHash}`,
          title: "Revenue by month",
          display: "bar",
        },
      },
    } as any);

    expect(screen.getByText("Revenue by month")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Expand data sources" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: "Orders" }),
    ).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(
      await screen.findByRole("link", { name: "Orders" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse data sources" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Source is correct")).toBeInTheDocument();
  });

  it("mentions clicked chart values and makes them available to Metabot", async () => {
    const cardHash = serializeCardForUrl({
      name: "Revenue by month",
      display: "bar",
      dataset_query: {
        type: "query",
        database: 1,
        query: {},
      },
    } as any);

    setup({
      id: "msg",
      role: "agent",
      type: "data_part",
      part: {
        type: "adhoc_viz",
        version: 1,
        value: {
          query: { type: "query", database: 1, query: {} },
          link: `/question#${cardHash}`,
        },
      },
    });

    await userEvent.click(screen.getByTestId("embedded-question"));

    const prompt = mockSetPrompt.mock.calls[0][0];
    expect(console.warn).toHaveBeenCalledWith(
      "point doens't exist, generating new uuid",
    );
    expect(prompt).toMatch(
      /^\[[^\]]+ 2026 · 123\]\(metabase:\/\/data-point\/f10cfc50-2a0b-4c67-a064-7585d17974c7\)$/,
    );
    expect(mockFocusPromptInput).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId("embedded-question")).toHaveAttribute(
        "data-clicked",
        "true",
      ),
    );
    expect(screen.getByTestId("embedded-question")).toHaveAttribute(
      "data-clicked-via-mention",
      "false",
    );

    const context = await mockChatContextProvider?.();
    expect(context).toEqual({
      user_is_viewing: [
        expect.objectContaining({
          type: "adhoc",
          name: "Revenue by month",
          chart_configs: [
            expect.objectContaining({
              selected_data: expect.objectContaining({
                mention_id: "f10cfc50-2a0b-4c67-a064-7585d17974c7",
                label: expect.stringMatching(/^[^\]]+ 2026 · 123$/),
                value: 123,
                row: expect.objectContaining({
                  values: ["2026-01-01", 123],
                }),
              }),
            }),
          ],
        }),
      ],
    });
  });

  it("reuses matching generated query_execution data point ids", async () => {
    const cardHash = serializeCardForUrl({
      name: "Revenue by month",
      display: "bar",
      dataset_query: {
        type: "query",
        database: 1,
        query: {},
      },
    } as any);
    const dataPointId = "7714fa1e-288b-499d-887e-cbaf62b32bb6";

    setup(
      {
        id: "msg",
        role: "agent",
        type: "data_part",
        part: {
          type: "adhoc_viz",
          version: 1,
          value: {
            query: { type: "query", database: 1, query: {} },
            link: `/question#${cardHash}`,
          },
        },
      },
      {
        [dataPointId]: {
          row: ["2026-01-01", 123],
          value_column_index: 1,
        },
      },
    );

    await userEvent.click(screen.getByTestId("embedded-question"));

    expect(mockSetPrompt.mock.calls[0][0]).toMatch(
      new RegExp(
        `^\\[[^\\]]+ 2026 · 123\\]\\(metabase:\\/\\/data-point\\/${dataPointId}\\)$`,
      ),
    );
    expect(console.warn).not.toHaveBeenCalledWith(
      "point doens't exist, generating new uuid",
    );
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });

  it("highlights generated chart values linked by Metabot", async () => {
    const cardHash = serializeCardForUrl({
      name: "Revenue by month",
      display: "bar",
      dataset_query: {
        type: "query",
        database: 1,
        query: {},
      },
    } as any);
    const dataPointId = "f10cfc50-2a0b-4c67-a064-7585d17974c7";
    const dataPointTarget = {
      columns: ["Created At", "Revenue"],
      row: ["2026-01-01", 123],
      value_column_index: 1,
    };

    renderWithProviders(
      <Messages
        agentId="omnibot"
        messages={[
          {
            id: "chart",
            role: "agent",
            type: "data_part",
            part: {
              type: "adhoc_viz",
              version: 1,
              value: {
                query: { type: "query", database: 1, query: {} },
                link: `/question#${cardHash}`,
              },
            },
          },
          {
            id: "text",
            role: "agent",
            type: "text",
            message: `Revenue peaked at [May 2026](metabase://data-point/${dataPointId}).`,
          },
        ]}
        dataPointTargets={{ [dataPointId]: dataPointTarget }}
        isDoingScience={false}
        debug={false}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "May 2026" }));

    await waitFor(() =>
      expect(screen.getByTestId("embedded-question")).toHaveAttribute(
        "data-clicked-via-mention",
        "true",
      ),
    );
    expect(screen.getByTestId("embedded-question")).toHaveAttribute(
      "data-clicked",
      "false",
    );

    const context = await mockChatContextProvider?.();
    expect(context).toEqual({
      user_is_viewing: [
        expect.objectContaining({
          type: "adhoc",
          name: "Revenue by month",
          chart_configs: [
            expect.objectContaining({
              selected_data: expect.objectContaining({
                label: expect.stringMatching(/^[^"]+ 2026 · 123$/),
                value: 123,
                row: expect.objectContaining({
                  values: ["2026-01-01", 123],
                }),
              }),
            }),
          ],
        }),
      ],
    });
  });

  it("scrolls to the embedded chart when its link in the reply text is clicked", async () => {
    const cardHash = serializeCardForUrl({
      name: "Revenue by month",
      display: "bar",
      dataset_query: {
        type: "query",
        database: 1,
        query: {},
      },
    } as any);

    renderWithProviders(
      <Route
        path="/"
        component={() => (
          <Messages
            agentId="omnibot"
            messages={[
              {
                id: "chart",
                role: "agent",
                type: "data_part",
                part: {
                  type: "adhoc_viz",
                  version: 1,
                  value: {
                    query: { type: "query", database: 1, query: {} },
                    link: `/question#${cardHash}`,
                  },
                },
              },
              {
                id: "text",
                role: "agent",
                type: "text",
                message: `Here's your [the chart](/question#${cardHash}) — take a look.`,
              },
            ]}
            isDoingScience={false}
            debug={false}
          />
        )}
      />,
      { withRouter: true, initialRoute: "/" },
    );

    const scrollIntoView = getScrollIntoViewMock() as jest.Mock;
    scrollIntoView.mockClear();

    const link = screen.getByRole("link", { name: "the chart" });
    // Clicking scrolls to the embedded chart instead of navigating away.
    await userEvent.click(link);

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("renders the embedded chart title as a link that opens in a new tab", () => {
    const cardHash = serializeCardForUrl({
      name: "Revenue by month",
      display: "bar",
      dataset_query: {
        type: "query",
        database: 1,
        query: {},
      },
    } as any);

    renderWithProviders(
      <Route
        path="/"
        component={() => (
          <AgentMessage
            agentId="omnibot"
            debug={false}
            readonly={false}
            hideActions
            setFeedbackMessage={() => {}}
            submittedFeedback={undefined}
            getCopyText={() => ""}
            message={{
              id: "chart",
              role: "agent",
              type: "data_part",
              part: {
                type: "adhoc_viz",
                version: 1,
                value: {
                  query: { type: "query", database: 1, query: {} },
                  link: `/question#${cardHash}`,
                },
              },
            }}
          />
        )}
      />,
      { withRouter: true, initialRoute: "/" },
    );

    const card = screen.getByTestId("metabot-generated-question");
    const titleLink = within(card).getByRole("link", {
      name: "Revenue by month",
    });
    expect(titleLink).toHaveAttribute("target", "_blank");
    expect(titleLink).toHaveAttribute(
      "href",
      expect.stringContaining(`/question#${cardHash}`),
    );
  });

  it("highlights generated chart values when mention clicks only include state-backed ids", async () => {
    const cardHash = serializeCardForUrl({
      name: "Revenue by month",
      display: "bar",
      dataset_query: {
        type: "query",
        database: 1,
        query: {},
      },
    } as any);
    const dataPointId = "f10cfc50-2a0b-4c67-a064-7585d17974c7";
    const dataPointTarget = {
      columns: ["Created At", "Revenue"],
      row: ["2026-01-01", 123],
      value_column_index: 1,
    };

    renderWithProviders(
      <Messages
        agentId="omnibot"
        messages={[
          {
            id: "chart",
            role: "agent",
            type: "data_part",
            part: {
              type: "adhoc_viz",
              version: 1,
              value: {
                query: { type: "query", database: 1, query: {} },
                link: `/question#${cardHash}`,
              },
            },
          },
        ]}
        dataPointTargets={{ [dataPointId]: dataPointTarget }}
        isDoingScience={false}
        debug={false}
      />,
    );

    await screen.findByTestId("embedded-question");
    await waitFor(() =>
      expect(routeDataPointMention(dataPointTarget, dataPointId)).toBe(true),
    );

    await waitFor(() =>
      expect(screen.getByTestId("embedded-question")).toHaveAttribute(
        "data-clicked-via-mention",
        "true",
      ),
    );
    expect(screen.getByTestId("embedded-question")).toHaveAttribute(
      "data-clicked",
      "false",
    );
  });

  it("submits hidden repair feedback when an embedded custom visualization fails", async () => {
    mockQuestionDisplay = "custom:broken-viz";
    const cardHash = serializeCardForUrl({
      name: "Revenue by month",
      display: "custom:broken-viz",
      dataset_query: {
        type: "query",
        database: 1,
        query: {},
      },
    } as any);

    setup({
      id: "msg",
      role: "agent",
      type: "data_part",
      part: {
        type: "adhoc_viz",
        version: 1,
        value: {
          query: { type: "query", database: 1, query: {} },
          link: `/question#${cardHash}`,
          display: "custom:broken-viz",
        },
      },
    });

    await userEvent.click(screen.getByTestId("embedded-question-error"));

    await waitFor(() => {
      expect(mockSubmitInput).toHaveBeenCalledTimes(1);
    });
    const [payload] = mockSubmitInput.mock.calls[0];
    expect(payload.message).toContain(
      "Custom visualization render feedback: failed.",
    );
    expect(payload.message).toContain(
      "[plugin 4] blocked createElement: input",
    );
    expect(payload).toMatchObject({
      type: "text",
      hidden: true,
      suppressNavigateTo: true,
    });
  });

  it("hides the action bar on the last agent message while processing", () => {
    renderWithProviders(
      <Messages
        agentId="omnibot"
        messages={[
          { id: "u1", role: "user", type: "text", message: "hi" },
          { id: "a1", role: "agent", type: "text", message: "hello" },
        ]}
        isDoingScience
        debug={false}
      />,
    );

    const [, agentMessage] = screen.getAllByTestId("metabot-chat-message");
    expect(
      within(agentMessage).queryByTestId("metabot-chat-message-copy"),
    ).not.toBeInTheDocument();
  });

  it("does not re-render embedded charts when an unrelated prompt changes", async () => {
    const cardHash = serializeCardForUrl({
      name: "Revenue by month",
      display: "bar",
      dataset_query: {
        type: "query",
        database: 1,
        query: {},
      },
    } as any);
    const messages: MetabotChatMessage[] = [
      {
        id: "chart",
        role: "agent",
        type: "data_part",
        part: {
          type: "adhoc_viz",
          version: 1,
          value: {
            query: { type: "query", database: 1, query: {} },
            link: `/question#${cardHash}`,
          },
        },
      },
    ];
    const dataPointTargets = {};

    const TestHarness = () => {
      const [prompt, setPrompt] = useState("");

      return (
        <>
          <input
            aria-label="Prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <Messages
            agentId="omnibot"
            messages={messages}
            dataPointTargets={dataPointTargets}
            isDoingScience={false}
            debug={false}
          />
        </>
      );
    };

    renderWithProviders(<TestHarness />);

    expect(mockQueryVisualizationRender).toHaveBeenCalledTimes(1);

    await userEvent.type(screen.getByLabelText("Prompt"), "show revenue");

    expect(mockQueryVisualizationRender).toHaveBeenCalledTimes(1);
  });

  describe("turn_errored", () => {
    it("shows locked message for metabase_ai_managed_locked errors", () => {
      setup({
        id: "msg",
        role: "agent",
        type: "turn_errored",
        error: { type: "metabase_ai_managed_locked" },
        display: {
          type: "locked",
          message: "You've used all of your included AI service tokens.",
        },
      });

      expect(
        screen.getByText(
          /You've used all of your included AI service tokens\./,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Start paid subscription/ }),
      ).toHaveAttribute(
        "href",
        "https://store.staging.metabase.com/account/manage/plans",
      );
    });

    it("shows the custom display message when provided", () => {
      setup({
        id: "msg",
        role: "agent",
        type: "turn_errored",
        error: { type: "stream_error" },
        display: {
          type: "alert",
          message: "The model is overloaded, please try again.",
        },
      });

      expect(
        screen.getByText(/The model is overloaded, please try again\./),
      ).toBeInTheDocument();
    });

    it("shows generic alert message when display message is missing", () => {
      setup({
        id: "msg",
        role: "agent",
        type: "turn_errored",
        error: { type: "stream_error" },
      });

      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });

    it("renders the raw error payload as a debug card when debug is true", () => {
      renderWithProviders(
        <AgentMessage
          agentId="omnibot"
          debug
          readonly={false}
          hideActions
          setFeedbackMessage={() => {}}
          submittedFeedback={undefined}
          getCopyText={() => ""}
          message={{
            id: "msg",
            role: "agent",
            type: "turn_errored",
            error: { type: "stream_error", message: "boom" },
          }}
        />,
      );

      const debugCard = screen.getByTestId(
        "metabot-chat-message-turn-alert-debug",
      );
      expect(debugCard).toHaveTextContent(/stream_error/);
      expect(debugCard).toHaveTextContent(/boom/);
    });
  });
});
