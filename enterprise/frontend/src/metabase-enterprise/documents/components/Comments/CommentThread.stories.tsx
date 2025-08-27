import type { StoryFn } from "@storybook/react";

import { Box, Flex } from "metabase/ui";

import { CommentThread, type CommentThreadProps } from "./CommentThread";

export default {
  title: "Components/Comments/CommentThread",
  component: Comment,
  argTypes: {},
  decorators: [
    (Story: StoryFn) => (
      <Flex w="100%" h="92vh" justify="center" align="center">
        <Box w="320px">
          <Story />
        </Box>
      </Flex>
    ),
  ],
};

function getDateRelativeToNow(secondsAgo: number) {
  return new Date(Date.now() - secondsAgo * 1000).toISOString();
}

export const SingleComment = {
  render: (args: CommentThreadProps) => <CommentThread {...args} />,
  args: {
    comment: {
      id: "1",
      content:
        "The revenue trend line is helpful, but could we also add quarter-over-quarter growth as a percentage?",
      createdAt: getDateRelativeToNow(60 * 60 * 24 * 2),
      author: {
        name: "John Doe",
      },
    },
  },
};

export const LongComment = {
  render: (args: CommentThreadProps) => <CommentThread {...args} />,
  args: {
    comment: {
      id: "1",
      content:
        "I really appreciate the new version of the dashboard, especially the way the KPIs are surfaced at the top. That definitely helps me quickly align with our daily goals. However, I think there are a few areas where we could improve to make the dashboard even more useful for analysis. For example, the revenue trend chart is great for spotting long-term movements, but it would be even more insightful if we could overlay major campaign dates or product launches so we can see correlations between business initiatives and performance.",
      createdAt: getDateRelativeToNow(60 * 60 * 24 * 2),
      author: {
        name: "Super long long long name that should wrap",
      },
    },
    replies: [
      {
        id: "2",
        content: "Yes, we can add that.",
        createdAt: getDateRelativeToNow(60),
        author: {
          name: "Jane Doe",
        },
      },
    ],
  },
};

export const CommentWithReplies = {
  render: (args: CommentThreadProps) => <CommentThread {...args} />,
  args: {
    comment: {
      id: "1",
      content:
        "The revenue dashboard looks good, but I think we're missing context on customer churn. Could we add a chart for that?",
      createdAt: getDateRelativeToNow(60 * 60 * 2),
      author: {
        name: "Priya Sharma",
      },
    },
    replies: [
      {
        id: "2",
        content:
          "Good point. We already track churn in a different dataset — I can try to join it with the revenue data.",
        createdAt: getDateRelativeToNow(60),
        author: {
          name: "Michael Chen",
        },
      },
      {
        id: "3",
        content:
          "Yes please, churn is critical for forecasting. If possible, let's show churn % next to revenue growth.",
        createdAt: getDateRelativeToNow(5),
        author: {
          name: "Sara Lopez",
        },
      },
    ],
  },
};
