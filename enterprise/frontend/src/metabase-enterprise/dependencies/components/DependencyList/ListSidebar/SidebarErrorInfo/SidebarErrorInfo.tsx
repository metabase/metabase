import cx from "classnames";

import { CopyButton } from "metabase/common/components/CopyButton";
import CS from "metabase/css/core/index.css";
import { Badge, Box, Card, Group, Stack, Title } from "metabase/ui";
import type { DependencyError, DependencyErrorType } from "metabase-types/api";

import { getDependencyErrorTypeLabel } from "../../../../utils";

import S from "./SidebarErrorInfo.module.css";

type SidebarErrorInfoProps = {
  type: DependencyErrorType;
  errors: DependencyError[];
};

export function SidebarErrorInfo({ type, errors }: SidebarErrorInfoProps) {
  const count = errors.length;
  const title = getDependencyErrorTypeLabel(type, count);
  const details = errors
    .map((error) => error.detail)
    .filter((detail) => detail != null);

  return (
    <Stack role="region" aria-label={title}>
      <Group gap="sm">
        <Badge c="text-selected" bg="error">
          {count}
        </Badge>
        <Title order={5}>{title}</Title>
      </Group>
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
              <Box
                className={cx(CS.textWrap, CS.textMonospace)}
                fz="sm"
                lh="h5"
              >
                {detail}
              </Box>
              <CopyButton value={detail} />
            </Group>
          ))}
        </Card>
      )}
    </Stack>
  );
}
