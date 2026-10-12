import { t } from "ttag";
import _ from "underscore";

import { Icon, Stack, Text, Tooltip } from "metabase/ui";
import { type GoalRefError, getGoalErrorMessage } from "metabase/viz-core";

export const GOAL_WARNING_ICON_SIZE = 12;
const TOOLTIP_MAX_WIDTH = 300;

type GoalWarningIconProps = {
  errors: GoalRefError[];
};

export function GoalWarningIcon({ errors }: GoalWarningIconProps) {
  const messages = _.uniq(errors.map((error) => getGoalErrorMessage(error)));

  return (
    <Tooltip
      label={
        <Stack gap="xs">
          {messages.map((message) => (
            <Text key={message} c="inherit" fz="inherit">
              {message}
            </Text>
          ))}
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
