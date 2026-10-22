import { match } from "ts-pattern";
import { t } from "ttag";

import { Icon, Tooltip, UnstyledButton } from "metabase/ui";

export const GOAL_WARNING_ICON_SIZE = 16;

type GoalWarningSource = "goal" | "color-ranges";

type GoalWarningIconProps = {
  source: GoalWarningSource;
  onClick: () => void;
};

export function GoalWarningIcon({ source, onClick }: GoalWarningIconProps) {
  return (
    <Tooltip label={getGoalWarningMessage(source)}>
      <UnstyledButton
        aria-label={t`Goal warning`}
        display="block"
        onClick={onClick}
      >
        <Icon
          c="feedback-negative"
          display="block"
          name="warning"
          size={GOAL_WARNING_ICON_SIZE}
        />
      </UnstyledButton>
    </Tooltip>
  );
}

function getGoalWarningMessage(source: GoalWarningSource) {
  return match(source)
    .with("goal", () => t`Couldn't get the goal value. Click to open settings.`)
    .with(
      "color-ranges",
      () => t`Couldn't get some color range values. Click to open settings.`,
    )
    .exhaustive();
}
