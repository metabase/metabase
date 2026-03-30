import type { ReactNode } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import CS from "metabase/css/core/index.css";
import { Box, Group, Card as MantineCard, Stack } from "metabase/ui";
import type { Card } from "metabase-types/api";

import S from "./InfoSection.module.css";

type InfoSectionProps = {
  card: Card;
};

export function InfoSection({ card }: InfoSectionProps) {
  const { description, creator, created_at } = card;
  const lastEditInfo = card["last-edit-info"];

  if (
    description == null &&
    (created_at == null || creator == null) &&
    lastEditInfo == null
  ) {
    return null;
  }

  return (
    <MantineCard
      p={0}
      shadow="none"
      withBorder
      role="region"
      aria-label={t`Info`}
    >
      {description != null && (
        <InfoSectionItem label={t`Description`}>
          {description.length > 0 ? (
            <Box className={CS.textWrap}>{description}</Box>
          ) : (
            <Box c="text-secondary">{t`No description`}</Box>
          )}
        </InfoSectionItem>
      )}
      {creator != null && created_at != null && (
        <InfoSectionItem label={t`Created by`} date={created_at}>
          <Box className={CS.textWrap}>{creator.common_name}</Box>
        </InfoSectionItem>
      )}
      {lastEditInfo != null && (
        <InfoSectionItem
          label={t`Last edited by`}
          date={lastEditInfo.timestamp}
        >
          <Box className={CS.textWrap}>
            {[lastEditInfo.first_name, lastEditInfo.last_name]
              .filter(Boolean)
              .join(" ")}
          </Box>
        </InfoSectionItem>
      )}
    </MantineCard>
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
