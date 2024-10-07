import { Box, Flex, Icon, Text } from "metabase/ui";

export const ScimTextWarning = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <Flex my=".25rem" gap="sm" align="start" c="var(--mb-color-text-medium)">
    <Box mt=".25rem">
      <Icon name="info_filled" />
    </Box>
    <Text fz=".75rem">{children}</Text>
  </Flex>
);
