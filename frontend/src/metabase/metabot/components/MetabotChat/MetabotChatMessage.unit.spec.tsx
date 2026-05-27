import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { serializeCardForUrl } from "metabase/common/utils/card";
import type { MetabotAgentChatMessage } from "metabase/metabot/state";

import { AgentMessage, Messages } from "./MetabotChatMessage";

const mockSetPrompt = jest.fn();
const mockFocusPromptInput = jest.fn();
const mockSubmitInput = jest.fn();
let mockPrompt = "";
let mockQuestionDisplay = "bar";
let mockChatContextProvider: (() => Promise<unknown>) | undefined;

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
    handleVisualizationClick,
    onVisualizationRenderError,
  }: any) => (
    <>
      <button
        data-testid="embedded-question"
        data-clicked={clicked ? "true" : "false"}
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
  ),
}));

const setup = (message: MetabotAgentChatMessage) =>
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
    />,
  );

describe("AgentMessage", () => {
  beforeEach(() => {
    mockPrompt = "";
    mockQuestionDisplay = "bar";
    mockSetPrompt.mockClear();
    mockFocusPromptInput.mockClear();
    mockSubmitInput.mockClear();
    mockChatContextProvider = undefined;
  });

  it("renders navigate_to responses as embedded question cards", () => {
    const cardHash = serializeCardForUrl({
      name: "Revenue by month",
      display: "table",
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
      part: { type: "navigate_to", version: 1, value: `/question#${cardHash}` },
    });

    expect(screen.getByText("Revenue by month")).toBeInTheDocument();
    expect(screen.queryByText(/generated question/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("embedded-question")).toBeInTheDocument();
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
      part: { type: "navigate_to", version: 1, value: `/question#${cardHash}` },
    });

    await userEvent.click(screen.getByTestId("embedded-question"));

    const prompt = mockSetPrompt.mock.calls[0][0];
    expect(prompt).toMatch(
      /^\[[^\]]+ 2026 · 123\]\(metabase:\/\/data-point\/1\)$/,
    );
    expect(mockFocusPromptInput).toHaveBeenCalled();
    expect(screen.getByTestId("embedded-question")).toHaveAttribute(
      "data-clicked",
      "true",
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
                mention_id: 1,
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
      part: { type: "navigate_to", version: 1, value: `/question#${cardHash}` },
    });

    await userEvent.click(screen.getByTestId("embedded-question-error"));

    await waitFor(() => {
      expect(mockSubmitInput).toHaveBeenCalledTimes(1);
    });
    const [feedback, options] = mockSubmitInput.mock.calls[0];
    expect(feedback).toContain("Custom visualization render feedback: failed.");
    expect(feedback).toContain("[plugin 4] blocked createElement: input");
    expect(options).toMatchObject({
      hidden: true,
      preventOpenSidebar: true,
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
