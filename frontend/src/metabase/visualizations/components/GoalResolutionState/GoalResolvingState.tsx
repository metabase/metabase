import { Center, Loader } from "metabase/ui";

type GoalResolvingStateProps = {
  className?: string;
  height: number;
};

export function GoalResolvingState({
  className,
  height,
}: GoalResolvingStateProps) {
  return (
    <Center className={className} h={height}>
      <Loader />
    </Center>
  );
}
