import { CopyButton } from "metabase/common/components/CopyButton";
import { Box, Card, Group, Stack, Title } from "metabase/ui";
import type { DependencyError, DependencyErrorType } from "metabase-types/api";

import {
  getDependencyErrorDetail,
  getDependencyErrorTypeCountMessage,
} from "../../../../utils";

import S from "./ErrorSection.module.css";

type ErrorSectionProps = {
  type: DependencyErrorType;
  errors: DependencyError[];
};

export function ErrorSection({ type, errors }: ErrorSectionProps) {
  const title = getDependencyErrorTypeCountMessage(type, errors.length);
  const details = errors
    .map((error) => getDependencyErrorDetail(error))
    .filter((detail) => detail != null);

  return (
    <Stack gap="md">
      <Title order={4}>{title}</Title>
      {details.length > 0 && (
        <Card p={0} shadow="none" withBorder>
          {details.map((detail, detailIndex) => (
            <Group
              key={detailIndex}
              className={S.item}
              p="md"
              justify="space-between"
              wrap="nowrap"
            >
              <Box>{detail}</Box>
              <CopyButton value={detail} />
            </Group>
          ))}
        </Card>
      )}
    </Stack>
  );
}
