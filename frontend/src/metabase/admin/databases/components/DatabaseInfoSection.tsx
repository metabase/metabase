import { Box, Card, Flex, type FlexProps, Text } from "metabase/ui";

interface DatabaseInfoSectionProps extends FlexProps {
  name: string;
  description: string;
  children: React.ReactNode;
  condensed?: boolean;
}

export const DatabaseInfoSection = ({
  name,
  description,
  children,
  condensed = false,
  ...props
}: DatabaseInfoSectionProps) => (
  <Flex gap="5.5rem" mb="5.5rem" {...props}>
    <Flex gap="lg" w="100%">
      <Flex
        direction="column"
        w="100%"
        maw="16rem"
        mt="md"
        style={{ flexShrink: 0 }}
      >
        <Text size="lg" fw="700" mb="xs" lh={1.4}>
          {name}
        </Text>
        <Text c="text-secondary" lh={1.4}>
          {description}
        </Text>
      </Flex>
      <Box w="100%">
        <Card
          withBorder
          bg="accent-gray-light"
          shadow="none"
          style={{ flexGrow: 0 }}
          px="1.5rem"
          py={condensed ? "1.125rem" : "1.875rem"}
        >
          {children}
        </Card>
      </Box>
    </Flex>
  </Flex>
);

// NOTE: not using Card.Section since it won't work if
// it's rendered within a React.Fragment: https://mantine.dev/core/card/#cardsection
export const DatabaseInfoSectionDivider = () => {
  return (
    <Box h="1px" w="calc(100% + 3rem)" ml="-1.5rem" my="1rem" bg="border" />
  );
};
