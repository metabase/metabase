import type { ReactNode } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import CS from "metabase/css/core/index.css";
import { Box, Card, Group, Stack } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import S from "./InfoSection.module.css";

type InfoSectionProps = {
  result: SearchResult;
};

export function InfoSection({ result }: InfoSectionProps) {
  const {
    description,
    creator_common_name,
    created_at,
    last_editor_common_name,
    last_edited_at,
  } = result;

  if (
    description == null &&
    (created_at == null || creator_common_name == null) &&
    (last_edited_at == null || last_editor_common_name == null)
  ) {
    return null;
  }

  return (
    <Card p={0} shadow="none" withBorder role="region" aria-label={t`Info`}>
      {description != null && (
        <InfoSectionItem label={t`Description`}>
          {description.length > 0 ? (
            <Box className={CS.textWrap}>{description}</Box>
          ) : (
            <Box c="text-secondary">{t`No description`}</Box>
          )}
        </InfoSectionItem>
      )}
      {creator_common_name != null && created_at != null && (
        <InfoSectionItem label={t`Created by`} date={created_at}>
          <Box className={CS.textWrap}>{creator_common_name}</Box>
        </InfoSectionItem>
      )}
      {last_editor_common_name != null && last_edited_at != null && (
        <InfoSectionItem label={t`Last edited by`} date={last_edited_at}>
          <Box className={CS.textWrap}>{last_editor_common_name}</Box>
        </InfoSectionItem>
      )}
    </Card>
  );
}

type InfoSectionItemProps = {
  label: string;
  date?: string;
  children?: ReactNode;
};

function InfoSectionItem({ label, date, children }: InfoSectionItemProps) {
  return (
    <Stack className={S.section} p="md" gap="xs">
      <Box className={CS.textWrap} c="text-secondary" fz="sm" lh="h5">
        {label}
      </Box>
      <Group lh="h4" justify="space-between" wrap="nowrap">
        {children}
        {date != null && (
          <Box c="text-secondary">
            <DateTime className={CS.textNoWrap} value={date} unit="day" />
          </Box>
        )}
      </Group>
    </Stack>
  );
}
