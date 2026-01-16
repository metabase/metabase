import { CopyButton } from "metabase/common/components/CopyButton";
import CS from "metabase/css/core/index.css";
import { Card, Group, Stack, Title } from "metabase/ui";
import type { DependencyError, DependencyErrorType } from "metabase-types/api";

import { getDependencyErrorTypeCountMessage } from "../../../../utils";

import S from "./SidebarErrorInfo.module.css";

type SidebarErrorInfoProps = {
  type: DependencyErrorType;
  errors: DependencyError[];
};

export function SidebarErrorInfo({ type, errors }: SidebarErrorInfoProps) {
  const title = getDependencyErrorTypeCountMessage(type, errors.length);
  const details = errors
    .map((error) => error.detail)
    .filter((detail) => detail != null);

  return (
    <Stack gap="sm" role="region" aria-label={title}>
      <Title order={5}>{title}</Title>
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
              <span className={CS.textWrap}>{detail}</span>
              <CopyButton value={detail} />
            </Group>
          ))}
        </Card>
      )}
    </Stack>
  );
}
