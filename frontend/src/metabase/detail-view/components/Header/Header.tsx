import { useMemo } from "react";

import {
  getAvatarColumn,
  getRowValue,
  getSubtitleColumn,
  getTitleColumn,
  renderValue,
} from "metabase/detail-view/utils";
import { useTranslateContent } from "metabase/i18n/hooks";
import {
  Box,
  Group,
  Icon,
  type IconName,
  Image,
  Stack,
  Text,
  rem,
} from "metabase/ui";
import type { DatasetColumn, RowValues } from "metabase-types/api";

import S from "./Header.module.css";

interface Props {
  columns: DatasetColumn[];
  icon?: IconName;
  row: RowValues;
}

const IMAGE_SIZE = 80;

export const Header = ({ columns, icon, row }: Props) => {
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

  if (!title && !subtitle && !avatar && !icon) {
    return null;
  }

  return (
    <Group data-testid="detail-view-header" gap="xl" wrap="nowrap">
      {(avatar || icon) && (
        <Box className={S.avatarFrame} flex="0 0 auto">
          {avatar && (
            <Image h={IMAGE_SIZE} src={String(avatar)} w={IMAGE_SIZE} />
          )}

          {!avatar && icon && (
            <Group h={IMAGE_SIZE} justify="center" w={IMAGE_SIZE}>
              <Icon c="brand" name={icon} size={24} />
            </Group>
          )}
        </Box>
      )}

      <Stack gap="sm">
        {titleColumn && title && (
          <Text
            c="text-primary"
            className={S.text}
            component="h1"
            fw="bold"
            fz={rem(32)}
            lh={1}
          >
            {renderValue(tc, title, titleColumn)}
          </Text>
        )}

        {subtitleColumn && subtitle && (
          <Text
            c="text-secondary"
            className={S.text}
            component="h2"
            fw="bold"
            fz={rem(14)}
            lh={1}
          >
            {renderValue(tc, subtitle, subtitleColumn)}
          </Text>
        )}
      </Stack>
    </Group>
  );
};
