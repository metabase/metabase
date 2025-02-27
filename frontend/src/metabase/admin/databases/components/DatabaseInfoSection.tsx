import { Box, Card, Flex, Text } from "metabase/ui";

export const DatabaseInfoSection = ({
  name,
  description,
  children,
}: {
  name: string;
  description: string;
  children: React.ReactNode;
}) => (
  <Flex gap="5.5rem" mb="5.5rem">
    <Flex gap="lg" w="100%">
      <Flex direction="column" maw="17rem">
        <Text size="lg" fw="700">
          {name}
        </Text>
        <Text c="text-secondary">{description}</Text>
      </Flex>
      <Box w="100%">
        <Card
          withBorder
          shadow="none"
          bg="bg-light"
          style={{ flexGrow: 0 }}
          px="1.375rem"
          py="1.875rem"
        >
          {children}
        </Card>
      </Box>
    </Flex>
  </Flex>
);
