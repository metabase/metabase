import { FixedSizeIcon, Text, Flex, Box } from "metabase/ui";

export const ScimTextWarning = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <Flex my=".25rem" gap="sm" align="start" c="var(--mb-color-text-medium)">
    <Box mt=".25rem">
      <FixedSizeIcon name="info_filled" />
    </Box>
    <Text fz=".75rem">{children}</Text>
  </Flex>
);
