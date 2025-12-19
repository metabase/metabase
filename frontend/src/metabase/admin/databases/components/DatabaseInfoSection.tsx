import type { PropsWithChildren } from "react";

import Markdown from "metabase/common/components/Markdown";
import {
  Box,
  Card,
  Divider,
  Flex,
  type FlexProps,
  Stack,
  Text,
} from "metabase/ui";

interface DatabaseInfoSectionProps extends FlexProps {
  name: string;
  description: string;
  condensed?: boolean;
}

export const DatabaseInfoSection = ({
  name,
  description,
  children,
  condensed = false,
  ...props
}: PropsWithChildren<DatabaseInfoSectionProps>) => (
  <Flex gap="lg" w="100%" direction={{ sm: "row", base: "column" }} {...props}>
    <Stack w="100%" maw={{ sm: "16rem" }} mt="md" style={{ flexShrink: 0 }}>
      <Text size="lg" fw="700" mb="xs" lh={1.4}>
        {name}
      </Text>
      <Markdown c="text-secondary">{description}</Markdown>
    </Stack>
    <Box w="100%">
      <Card
        withBorder
        bg="background-secondary"
        shadow="none"
        style={{ flexGrow: 0 }}
        px="lg"
        py={condensed ? "1.125rem" : "1.875rem"}
      >
        {children}
      </Card>
    </Box>
  </Flex>
);

// NOTE: not using Card.Section since it won't work if
// it's rendered within a React.Fragment: https://mantine.dev/core/card/#cardsection
export const DatabaseInfoSectionDivider = ({
  condensed = false,
}: {
  condensed?: boolean;
}) => {
  return (
    <Divider w="calc(100% + 3rem)" ml="-1.5rem" my={condensed ? "md" : "lg"} />
  );
};
