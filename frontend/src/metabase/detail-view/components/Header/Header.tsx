import { useMemo } from "react";

import {
  getAvatarColumn,
  getRowValue,
  getSubtitleColumn,
  getTitleColumn,
  renderValue,
} from "metabase/detail-view/utils";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Box, Group, Icon, Image, Stack, Text, rem } from "metabase/ui";
import type { DatasetColumn, RowValues } from "metabase-types/api";

import S from "./Header.module.css";

interface Props {
  columns: DatasetColumn[];
  row: RowValues;
}

const IMAGE_SIZE = 80;

export const Header = ({ columns, row }: Props) => {
  const tc = useTranslateContent();
  const titleColumn = useMemo(() => getTitleColumn(columns), [columns]);
  const subtitleColumn = useMemo(() => getSubtitleColumn(columns), [columns]);
  const avatarColumn = useMemo(() => getAvatarColumn(columns), [columns]);
  const title = useMemo(
    () => getRowValue(columns, titleColumn, row),
    [columns, titleColumn, row],
  );
  const subtitle = useMemo(
    () => getRowValue(columns, subtitleColumn, row),
    [columns, subtitleColumn, row],
  );
  const avatar = useMemo(
    () => getRowValue(columns, avatarColumn, row),
    [columns, avatarColumn, row],
  );

  return (
    <Group gap="xl">
      {avatarColumn && avatar && (
        <Box className={S.avatarFrame} flex="0 0 auto">
          <Image h={IMAGE_SIZE} src={String(avatar)} w={IMAGE_SIZE} />
        </Box>
      )}

      <Stack gap="md">
        {titleColumn && title && (
          <Text c="text-primary" fw="bold" fz={rem(32)} lh={1}>
            {renderValue(tc, title, titleColumn)}
          </Text>
        )}

        {subtitleColumn && subtitle && (
          <Group gap="sm">
            <Icon name="label" />

            <Text c="text-secondary" fw="bold" fz={rem(14)} lh={1}>
              {renderValue(tc, subtitle, subtitleColumn)}
            </Text>
          </Group>
        )}
      </Stack>
    </Group>
  );
};
