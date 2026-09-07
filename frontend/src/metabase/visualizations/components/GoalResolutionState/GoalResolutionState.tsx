import { Center, Loader, Text } from "metabase/ui";
import { getUnresolvedGoalMessage } from "metabase/viz-core";

type GoalResolutionStateProps = {
  className?: string;
  height: number;
  message?: string;
  status: "resolving" | "failed";
};

export function GoalResolutionState({
  className,
  height,
  message = getUnresolvedGoalMessage(),
  status,
}: GoalResolutionStateProps) {
  return (
    <Center className={className} h={height} px="md">
      {status === "resolving" ? (
        <Loader />
      ) : (
        <Text c="text-secondary" ta="center">
          {message}
        </Text>
      )}
    </Center>
  );
}
