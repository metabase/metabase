import { Center, Text } from "metabase/ui";

type GoalFailedStateProps = {
  className?: string;
  height: number;
  message: string;
};

export function GoalFailedState({
  className,
  height,
  message,
}: GoalFailedStateProps) {
  return (
    <Center className={className} h={height} px="md">
      <Text c="text-secondary" ta="center">
        {message}
      </Text>
    </Center>
  );
}
