import type { SdkErrorComponentProps } from "embedding-sdk-bundle/types";
import { Icon, Stack, Text } from "metabase/ui";

export const DataAppErrorState = ({ message }: SdkErrorComponentProps) => (
  <Stack align="center" justify="center" gap="sm" p="lg" ta="center">
    <Icon name="warning" size={28} c="text-tertiary" />
    <Text c="text-secondary">{message}</Text>
  </Stack>
);
