import { useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { Box, Flex, Loader, Skeleton, Stack, Text } from "metabase/ui";

export const LoadingSpinner = ({ text }: { text?: string }) => (
  <Flex align="center" justify="center" h="100%" gap="md">
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

// Uneven label widths keep the skeleton rows from looking mechanically uniform.
const SKELETON_ROW_WIDTHS = [
  "70%",
  "55%",
  "80%",
  "45%",
  "65%",
  "75%",
  "50%",
  "60%",
];

export const DelayedSkeleton = ({ delay = 300 }: { delay?: number }) => {
  const [show, setShow] = useState(false);
  const widths = useMemo(() => _.shuffle(SKELETON_ROW_WIDTHS), []);

  useMount(() => {
    const timeout = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timeout);
  });

  if (!show) {
    // make tests aware that things are loading
    return <span data-testid="loading-indicator" />;
  }

  return (
    <Stack gap="md" data-testid="loading-indicator">
      {widths.map((width, index) => (
        <Flex key={index} align="center" gap="sm">
          <Skeleton height="1rem" width="1rem" radius="sm" />
          <Skeleton height="0.75rem" width={width} radius="sm" />
        </Flex>
      ))}
    </Stack>
  );
};

export const ItemListLoader = () => (
  <Box w={365} h="100%" p="1rem" aria-label={t`Loading...`}>
    <DelayedSkeleton />
  </Box>
);
