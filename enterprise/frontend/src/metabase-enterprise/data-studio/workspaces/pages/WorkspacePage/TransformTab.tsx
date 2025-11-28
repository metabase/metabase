import { t } from "ttag";

import { Box, Button, Group, Icon, Stack } from "metabase/ui";
import type { DraftTransformSource } from "metabase-types/api";

import { TransformEditor } from "./TransformEditor";

interface Props {
  source: DraftTransformSource;
}

export const TransformTab = ({ source }: Props) => {
  return (
    <Stack gap={0}>
      <Group flex="0 0 auto" justify="space-between" p="md">
        <Group>{t`Output table input?`}</Group>

        <Group>
          <Button leftSection={<Icon name="play" />} size="sm">{t`Run`}</Button>

          <Button size="sm" variant="filled">{t`Save`}</Button>
        </Group>
      </Group>

      <Box flex="1">
        <TransformEditor source={source} />
      </Box>
    </Stack>
  );
};
