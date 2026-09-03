import { Center, Loader, Text } from "metabase/ui";

type Props = {
  className?: string;
  height: number;
};

export function GoalResolvingState({ className, height }: Props) {
  return (
    <Center className={className} h={height}>
      <Loader />
    </Center>
  );
}

export function GoalFailedState({
  className,
  height,
  message,
}: Props & { message: string }) {
  return (
    <Center className={className} h={height} px="md">
      <Text c="text-secondary" ta="center">
        {message}
      </Text>
    </Center>
  );
}
