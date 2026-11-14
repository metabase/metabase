import type { PropsWithChildren } from "react";

import { Markdown } from "metabase/common/components/Markdown";
import {
  Box,
  type BoxProps,
  Card,
  type CardProps,
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
  /** Side padding inside the content card */
  contentPx?: BoxProps["px"];
  /** Off puts the content straight beside the heading, without the card */
  hasCard?: boolean;
  cardRadius?: CardProps["radius"];
}

export const DatabaseInfoSection = ({
  name,
  description,
  children,
  condensed = false,
  contentPx = "xl",
  hasCard = true,
  cardRadius,
  ...props
}: PropsWithChildren<DatabaseInfoSectionProps>) => (
  <Flex gap="xl" w="100%" direction={{ sm: "row", base: "column" }} {...props}>
    <Stack
      w="100%"
      maw={{ sm: "16rem" }}
      mt={hasCard ? "lg" : 0}
      style={{ flexShrink: 0 }}
    >
      <Text size="lg" fw="700" mb="xxs" lh={1.4}>
        {name}
      </Text>
      <Markdown c="text-secondary">{description}</Markdown>
    </Stack>
    <Box w="100%">
      {hasCard ? (
        <Card
          withBorder
          bg="background_page-secondary"
          shadow="none"
          radius={cardRadius}
          style={{ flexGrow: 0 }}
          px={contentPx}
          py={condensed ? "1.125rem" : "1.875rem"}
        >
          {children}
        </Card>
      ) : (
        children
      )}
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
    <Divider w="calc(100% + 3rem)" ml="-1.5rem" my={condensed ? "lg" : "xl"} />
  );
};
