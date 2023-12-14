import { Loader, Flex, Text } from "metabase/ui"

export const LoadingSpinner = ({ text }: { text?: string }) => (
  <Flex align="center" justify="center" h="100%">
    <Loader size="lg" />
    {!!text && <Text color="text-medium">{text}</Text>}
  </Flex>
);
