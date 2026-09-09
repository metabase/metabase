import { Center, Loader, Text } from "metabase/ui";
import type { GoalResolutionStatus } from "metabase/visualizations/hooks/use-answered-goal-data";
import {
  type GoalSettingKind,
  getUnresolvedGoalMessage,
} from "metabase/viz-core";

type GoalResolutionStateProps = {
  className?: string;
  height: number;
  kind: GoalSettingKind;
  status: Exclude<GoalResolutionStatus, "resolved">;
};

export function GoalResolutionState({
  className,
  height,
  kind,
  status,
}: GoalResolutionStateProps) {
  return (
    <Center className={className} h={height} px="md">
      {status === "resolving" ? (
        <Loader />
      ) : (
        <Text c="text-secondary" ta="center">
          {getUnresolvedGoalMessage(kind)}
        </Text>
      )}
    </Center>
  );
}
