import type { LoadingProps } from "metabase/components/Loading";
import { DelayedLoading } from "metabase/components/Loading/DelayedLoading";
import { Flex, Loader, Text } from "metabase/ui";

export const LoadingSpinner = ({ text }: { text?: string }) => (
  <Flex
    align="center"
    justify="center"
    h="100%"
    data-testid="loading-indicator"
    gap="md"
  >
    <Loader size="lg" />
    {!!text && <Text color="text-medium">{text}</Text>}
  </Flex>
);

// sometimes showing a loading spinner can make things feel slow. This loading spinner
// will only appear if the component is still loading after a certain delay
export const DelayedLoadingSpinner = ({
  text,
  ...props
}: {
  text?: string;
} & LoadingProps) => {
  return <DelayedLoading {...props} loader={<LoadingSpinner text={text} />} />;
};
