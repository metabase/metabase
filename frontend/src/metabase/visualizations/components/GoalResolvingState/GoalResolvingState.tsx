import { Center, Loader } from "metabase/ui";

type GoalResolvingStateProps = {
  className?: string;
};

export function GoalResolvingState({ className }: GoalResolvingStateProps) {
  return (
    <Center className={className} flex={1} mih={0} px="md">
      <Loader />
    </Center>
  );
}
