import { Loader, Text } from "metabase/ui";

type JoinStepStatCellProps = {
  value: undefined | unknown;
  isLoading: boolean;
};

export const JoinStepStatCell = ({
  value,
  isLoading,
}: JoinStepStatCellProps) => {
  if (isLoading) {
    return <Loader size="xs" />;
  }
  return <Text fw={500}>{value?.toString() ?? "-"}</Text>;
};
