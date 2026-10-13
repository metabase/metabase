import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { Icon, List, Stack, Text, Tooltip } from "metabase/ui";
import { type GoalRefError, getGoalErrorMessage } from "metabase/viz-core";

export const GOAL_WARNING_ICON_SIZE = 12;
const TOOLTIP_MAX_WIDTH = 300;

type GoalWarningSource = "goal" | "color-ranges";

type GoalWarningIconProps = {
  errors: GoalRefError[];
  source: GoalWarningSource;
};

export function GoalWarningIcon({ errors, source }: GoalWarningIconProps) {
  const messages = _.uniq(errors.map((error) => getGoalErrorMessage(error)));

  return (
    <Tooltip
      label={
        <Stack gap={0}>
          <Text c="inherit" fz="inherit">
            {getGoalWarningTitle(source)}
          </Text>
          <List fz="inherit">
            {[...messages, ...messages].map((message) => (
              <List.Item c="inherit" key={message}>
                {message}
              </List.Item>
            ))}
          </List>
        </Stack>
      }
      maw={TOOLTIP_MAX_WIDTH}
      multiline
    >
      <Icon
        aria-label={t`Goal warning`}
        c="error"
        display="block"
        name="warning"
        size={GOAL_WARNING_ICON_SIZE}
      />
    </Tooltip>
  );
}

const getGoalWarningTitle = (source: GoalWarningSource) =>
  match(source)
    .with("goal", () => t`Couldn't get the goal value`)
    .with("color-ranges", () => t`Couldn't get some color range values`)
    .exhaustive();
