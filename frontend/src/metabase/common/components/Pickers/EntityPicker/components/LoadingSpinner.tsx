import { useState } from "react";
import { useMount } from "react-use";

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
    {!!text && <Text color="text-secondary">{text}</Text>}
  </Flex>
);

// sometimes showing a loading spinner can make things feel slow. This loading spinner
// will only appear if the component is still loading after a certain delay
export const DelayedLoadingSpinner = ({
  text,
  delay = 100,
}: {
  text?: string;
  delay?: number;
}) => {
  const [show, setShow] = useState(false);

  useMount(() => {
    const timeout = setTimeout(() => {
      setShow(true);
    }, delay);
    return () => clearTimeout(timeout);
  });

  if (!show) {
    // make tests aware that things are loading
    return <span data-testid="loading-indicator" />;
  }

  return <LoadingSpinner text={text} />;
};
