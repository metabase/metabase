import { t } from "ttag";

import { Box, Button, Group } from "metabase/ui";
import type { Transform } from "metabase-types/api";

type TransformListProps = {
  transforms: Transform[];
};

export function TransformList(_props: TransformListProps) {
  return (
    <Box pb="xl">
      <Group pt="xl" px="xl" justify="end">
        <Button>{t`New transform`}</Button>
      </Group>
    </Box>
  );
}
