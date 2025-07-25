import type { StoryFn } from "@storybook/react";
import { HttpResponse, http } from "msw";
import type { ComponentProps } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box } from "metabase/ui";

import { MetabotQuestion } from "./MetabotQuestion";

type MetabotQuestionProps = ComponentProps<typeof MetabotQuestion>;

export default {
  title: "EmbeddingSDK/MetabotQuestion",
  component: MetabotQuestion,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

const Template: StoryFn<MetabotQuestionProps> = () => {
  return (
    <Box
      bg="var(--mb-color-background)"
      mih="100vh"
      bd="1px solid #000"
      pt="2rem"
    >
      <MetabotQuestion />
    </Box>
  );
};

export const Default = {
  render: Template,
};

export const RedirectReaction = {
  render: Template,
  parameters: {
    msw: {
      handlers: [
        http.post("*/api/ee/metabot-v3/v2/agent", () => {
          return HttpResponse.json({
            reactions: [
              {
                type: "metabot.reaction/message",
                "repl/message_color": "green",
                "repl/message_emoji": "🤖",
                message: "Here are the results",
              },
              {
                type: "metabot.reaction/redirect",
                url: "/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxLCJ0eXBlIjoicXVlcnkiLCJxdWVyeSI6eyJzb3VyY2UtdGFibGUiOjJ9fSwiZGlzcGxheSI6InRhYmxlIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e30sInR5cGUiOiJxdWVzdGlvbiJ9",
              },
            ],
            history: [
              {
                role: "user",
                content: "best selling products in 2024",
              },
              {
                role: "assistant",
                "tool-calls": [
                  {
                    id: "call_5PU7OwgEiDnYKr9A2FTiNAfp",
                    name: "query",
                    arguments:
                      '{"query_plan":{"user_message_analysis":"The user is asking for the best selling products in 2024, which implies a need for sales data filtered by year.","candidate_metrics":[],"candidate_tables":["card__139","card__140"],"conclusion":"I will use the Orders table to analyze the total quantity sold for each product in 2024."},"query":"Show the total quantity sold for each product in 2024, grouped by Product ID.","source":{"table_id":"card__139"}}',
                  },
                ],
              },
              {
                content: "Success!",
                role: "tool",
                "tool-call-id": "call_5PU7OwgEiDnYKr9A2FTiNAfp",
              },
              {
                content: "Here are the results",
                role: "assistant",
                "navigate-to":
                  "/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxLCJ0eXBlIjoicXVlcnkiLCJxdWVyeSI6eyJzb3VyY2UtdGFibGUiOjJ9fSwiZGlzcGxheSI6InRhYmxlIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e30sInR5cGUiOiJxdWVzdGlvbiJ9",
              },
            ],
            state: {
              queries: {
                "5kt_rzk_792erogqj_oh_ku_5m": {
                  database: 2,
                  type: "query",
                  query: {
                    aggregation: [
                      [
                        "sum",
                        [
                          "field",
                          "quantity",
                          {
                            base_type: "type/Decimal",
                          },
                        ],
                      ],
                    ],
                    breakout: [
                      [
                        "field",
                        "product_id",
                        {
                          base_type: "type/BigInteger",
                        },
                      ],
                    ],
                    source_table: "card__139",
                    aggregation_idents: {
                      "0": "_c5p_PVpsm6A7dOqupLHE",
                    },
                    breakout_idents: {
                      "0": "9URvg0Oy6owTr7qt2UdsZ",
                    },
                    filter: [
                      "=",
                      [
                        "get-year",
                        [
                          "field",
                          "created_at",
                          {
                            base_type: "type/DateTimeWithLocalTZ",
                          },
                        ],
                      ],
                      2024,
                    ],
                  },
                },
                "8zzlkFleApnbGONeqT4sN": {
                  database: 2,
                  type: "query",
                  query: {
                    aggregation: [
                      [
                        "sum",
                        [
                          "field",
                          "quantity",
                          {
                            "base-type": "type/Decimal",
                          },
                        ],
                      ],
                    ],
                    breakout: [
                      [
                        "field",
                        "product_id",
                        {
                          "base-type": "type/BigInteger",
                        },
                      ],
                    ],
                    "source-table": "card__139",
                    filter: [
                      "=",
                      [
                        "get-year",
                        [
                          "field",
                          "created_at",
                          {
                            "base-type": "type/DateTimeWithLocalTZ",
                          },
                        ],
                      ],
                      2024,
                    ],
                  },
                },
              },
            },
            conversation_id: "d90328fc-5ed5-1119-03f7-86866d71c488",
          });
        }),
      ],
    },
  },
};

export const MessageReaction = {
  render: Template,
  parameters: {
    msw: {
      handlers: [
        http.post("*/api/ee/metabot-v3/v2/agent", () => {
          return HttpResponse.json({
            reactions: [
              {
                type: "metabot.reaction/message",
                "repl/message_color": "green",
                "repl/message_emoji": "🤖",
                message:
                  "Do you want to see the products earning the most money or the ones selling most units?",
              },
            ],
            history: [
              {
                role: "user",
                content: "This is what user has typed",
              },
              {
                content:
                  "Do you want to see the products earning the most money or the ones selling most units?",
                role: "assistant",
              },
            ],
            state: {
              queries: {},
            },
            conversation_id: "c7635bd0-84f3-f06d-1db8-571db7ff0cf6",
          });
        }),
      ],
    },
  },
};

export const LongMessageReaction = {
  render: Template,
  parameters: {
    msw: {
      handlers: [
        http.post("*/api/ee/metabot-v3/v2/agent", () => {
          return HttpResponse.json({
            reactions: [
              {
                type: "metabot.reaction/message",
                "repl/message_color": "green",
                "repl/message_emoji": "🤖",
                message:
                  "lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum",
              },
            ],
            history: [
              {
                role: "user",
                content: "This is what user has typed",
              },
              {
                content:
                  "lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum",
                role: "assistant",
              },
            ],
            state: {
              queries: {},
            },
            conversation_id: "c7635bd0-84f3-f06d-1db8-571db7ff0cf6",
          });
        }),
      ],
    },
  },
};

export const MultipleMessagesReaction = {
  render: Template,
  parameters: {
    msw: {
      handlers: [
        http.post("*/api/ee/metabot-v3/v2/agent", () => {
          return HttpResponse.json({
            reactions: [
              {
                type: "metabot.reaction/message",
                "repl/message_color": "green",
                "repl/message_emoji": "🤖",
                message: "This is the first message",
              },
              {
                type: "metabot.reaction/message",
                "repl/message_color": "green",
                "repl/message_emoji": "🤖",
                message: "This is the second message",
              },
            ],
            history: [
              {
                role: "user",
                content: "This is what user has typed",
              },
              {
                content: "This is the first message",
                role: "assistant",
              },
              {
                content: "This is the second message",
                role: "assistant",
              },
            ],
            state: {
              queries: {},
            },
            conversation_id: "c7635bd0-84f3-f06d-1db8-571db7ff0cf6",
          });
        }),
      ],
    },
  },
};

export const MetabotError = {
  render: Template,
  parameters: {
    msw: {
      handlers: [
        http.post("*/api/ee/metabot-v3/v2/agent", () => {
          return new HttpResponse(null, {
            status: 500,
          });
        }),
      ],
    },
  },
};
