import { useState } from "react";
import { useMount } from "react-use";

import {
  ListSkeleton,
  LoadingSkeleton,
} from "metabase/common/components/Skeletons";
import { Flex, Loader, Text } from "metabase/ui";

export const LoadingSpinner = ({ text }: { text?: string }) => (
  <Flex align="center" justify="center" h="100%" gap="lg">
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

export const DelayedSkeleton = ({ delay = 300 }: { delay?: number }) => {
  const [show, setShow] = useState(false);

  useMount(() => {
    const timeout = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timeout);
  });

  if (!show) {
    // make tests aware that things are loading
    return <span data-testid="loading-indicator" />;
  }

  return (
    <LoadingSkeleton>
      <ListSkeleton rows={8} />
    </LoadingSkeleton>
  );
};
