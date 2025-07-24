import { Link } from "react-router";
import { t } from "ttag";

import { Box, Button, Group, Stack, rem } from "metabase/ui";
import type { Transform, TransformId } from "metabase-types/api";

import { newTransformUrl } from "../../../utils/urls";

import { TransformItem } from "./TransformItem";

type TransformListProps = {
  transforms: Transform[];
  transformId: TransformId | undefined;
};

export function TransformList({ transforms, transformId }: TransformListProps) {
  return (
    <Box pb="xl">
      <Group px="xl" pt="xl" pb={rem(12)} justify="end">
        <Button component={Link} to={newTransformUrl()}>
          {t`New transform`}
        </Button>
      </Group>
      <Stack px="xl" gap={rem(12)}>
        {transforms.map((transform) => (
          <TransformItem
            key={transform.id}
            transform={transform}
            isActive={transform.id === transformId}
          />
        ))}
      </Stack>
    </Box>
  );
}
