import cx from "classnames";
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { Box, Image, Stack, Text, rem } from "metabase/ui";
import { TYPE } from "metabase-lib/v1/types/constants";
import { isFK, isa } from "metabase-lib/v1/types/utils/isa";
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
  const json = useMemo(() => getJson(column, value), [column, value]);

  if (isEmptyValue) {
    return <Text c="text-tertiary">{t`empty`}</Text>;
  }

  if (json) {
    return (
      <CodeEditor
        className={S.json}
        language="json"
        lineNumbers={false}
        value={json}
      />
    );
  }

  if (isFK(column) && newTableId != null && !isValidLink) {
    return (
      <Text
        bg="background-secondary"
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
          bg="background-secondary"
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

function getJson(
  column: DatasetColumn,
  value: RowValue | undefined,
): string | undefined {
  if (!value || typeof value === "number" || typeof value === "boolean") {
    return undefined;
  }

  if (
    column.semantic_type &&
    isa(column.semantic_type, TYPE.SerializedJSON) &&
    typeof value == "string"
  ) {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch (error) {
      return undefined;
    }
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return undefined;
    }
  }

  return undefined;
}
