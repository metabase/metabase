import type { StoryFn } from "@storybook/react";

import { Box, Flex } from "metabase/ui";

import { Discussion, type DiscussionProps } from "./Discussion";

export default {
  title: "Components/Comments/Discussion",
  component: Discussion,
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
  render: (args: DiscussionProps) => <Discussion {...args} />,
  args: {
    comments: [
      {
        id: "1",
        content_str_stup:
          "The revenue trend line is helpful, but could we also add quarter-over-quarter growth as a percentage?",
        created_at: getDateRelativeToNow(60 * 60 * 24 * 2),
        creator: {
          common_name: "John Doe",
        },
      },
    ],
  },
};

export const LongComment = {
  render: (args: DiscussionProps) => <Discussion {...args} />,
  args: {
    comments: [
      {
        id: "1",
        content_str_stup:
          "I really appreciate the new version of the dashboard, especially the way the KPIs are surfaced at the top. That definitely helps me quickly align with our daily goals. However, I think there are a few areas where we could improve to make the dashboard even more useful for analysis. For example, the revenue trend chart is great for spotting long-term movements, but it would be even more insightful if we could overlay major campaign dates or product launches so we can see correlations between business initiatives and performance.",
        created_at: getDateRelativeToNow(60 * 60 * 24 * 2),
        creator: {
          common_name: "Super long long long name that should wrap",
        },
      },
      {
        id: "2",
        content_str_stup: "Yes, we can add that.",
        created_at: getDateRelativeToNow(60),
        creator: {
          common_name: "Jane Doe",
        },
      },
    ],
  },
};

export const CommentWithReplies = {
  render: (args: DiscussionProps) => <Discussion {...args} />,
  args: {
    comments: [
      {
        id: "1",
        content_str_stup:
          "The revenue dashboard looks good, but I think we're missing context on customer churn. Could we add a chart for that?",
        created_at: getDateRelativeToNow(60 * 60 * 2),
        creator: {
          common_name: "Priya Sharma",
        },
      },
      {
        id: "2",
        content_str_stup:
          "Good point. We already track churn in a different dataset — I can try to join it with the revenue data.",
        created_at: getDateRelativeToNow(60),
        creator: {
          common_name: "Michael Chen",
        },
      },
      {
        id: "3",
        content_str_stup:
          "Yes please, churn is critical for forecasting. If possible, let's show churn % next to revenue growth.",
        created_at: getDateRelativeToNow(5),
        creator: {
          common_name: "Sara Lopez",
        },
      },
    ],
  },
};
