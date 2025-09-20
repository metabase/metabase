import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { Box, Image, Stack, Text, rem } from "metabase/ui";
import { isFK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, Field, RowValue } from "metabase-types/api";

import S from "./Value.module.css";

interface Props {
  children: ReactNode;
  column: DatasetColumn;
  field: Field | undefined;
  value: RowValue | undefined;
}

const FRAME_SIZE = 240;
const IMAGE_SIZE = FRAME_SIZE - 2 * 16;

export const Value = ({ children, column, field, value }: Props) => {
  const isEmptyValue = value == null || value === "";
  const newTableId = field?.target?.table_id;
  const isValidLink = Boolean(
    column.settings?.view_as === "link" &&
      column.settings.link_text &&
      column.settings.link_url,
  );

  if (isEmptyValue) {
    return <Text c="text-light">{t`empty`}</Text>;
  }

  if (isFK(column) && newTableId != null && !isValidLink) {
    return (
      <Text
        bg="var(--mb-color-bg-light)"
        c="text-primary"
        className={S.fk}
        component={Link}
        fw="bold"
        my={rem(-1)}
        px="sm"
        to={`/table/${newTableId}/detail/${value}`}
      >
        {children}
      </Text>
    );
  }

  if (column.settings?.view_as === "image") {
    return (
      <Stack className={S.value} gap="sm" align="flex-start">
        <Box
          bg="var(--mb-color-background-light)"
          className={S.imageFrame}
          mah={FRAME_SIZE}
          maw={FRAME_SIZE}
          p="md"
        >
          <Image mah={IMAGE_SIZE} src={value} maw={IMAGE_SIZE} />
        </Box>

        <Text
          c="text-primary"
          className={S.maxHeight}
          component="a"
          fw="bold"
          href={String(value)}
          rel="noopener noreferrer"
          target="_blank"
        >
          {String(value)}
        </Text>
      </Stack>
    );
  }

  return (
    <Text c="text-primary" className={cx(S.value, S.maxHeight)} fw="bold">
      {children}
    </Text>
  );
};
