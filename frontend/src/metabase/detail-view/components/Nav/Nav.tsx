import type { ReactNode } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetTableQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import { Box, Group, Icon, Text, rem } from "metabase/ui";
import type { TableId } from "metabase-types/api";

import { Breadcrumb } from "./Breadcrumb";
import S from "./Nav.module.css";
import { NavButton } from "./NavButton";
import { getExploreTableUrl } from "./utils";

interface Props {
  rowName: ReactNode;
  tableId: TableId;
  onBackClick?: () => void;
  onNextClick?: () => void;
  onPreviousClick?: () => void;
}

export const Nav = ({
  rowName,
  tableId,
  onBackClick,
  onNextClick,
  onPreviousClick,
}: Props) => {
  const { data: table } = useGetTableQuery({ id: tableId });

  const { data: schemas, isLoading: isLoadingSchemas } =
    useListDatabaseSchemasQuery(
      table && table.db_id && table.schema ? { id: table.db_id } : skipToken,
    );

  // TODO: error handling, loading state handling
  if (!table || !table.db || isLoadingSchemas) {
    return null;
  }

  return (
    <Group align="center" gap="md">
      {onBackClick && (
        <NavButton
          flex="0 0 auto"
          icon="arrow_left"
          tooltip={t`Back to table`}
          onClick={onBackClick}
        />
      )}

      {(onNextClick || onPreviousClick) && (
        <Group align="center" flex="0 0 auto" gap="sm">
          <NavButton
            icon="chevronup"
            tooltip={t`Previous row`}
            onClick={onPreviousClick}
          />

          <NavButton
            icon="chevrondown"
            tooltip={t`Next row`}
            onClick={onNextClick}
          />
        </Group>
      )}

      <Group align="center" gap={0}>
        <Breadcrumb href={`/browse/databases/${table.db_id}`}>
          <Group align="center" gap={rem(10)} wrap="nowrap">
            <Icon flex="0 0 auto" name="database" size={20} />

            <Box>{table.db.name}</Box>
          </Group>
        </Breadcrumb>

        {schemas && schemas.length > 1 && table.schema && (
          <>
            <Separator />

            <Breadcrumb
              href={`/browse/databases/${table.db_id}/schema/${table.schema}`}
            >
              {table.schema}
            </Breadcrumb>
          </>
        )}

        <Separator />

        <Breadcrumb href={getExploreTableUrl(table)}>
          {table.display_name}
        </Breadcrumb>

        {rowName && (
          <>
            <Separator />

            <Breadcrumb>{rowName}</Breadcrumb>
          </>
        )}
      </Group>
    </Group>
  );
};

const Separator = () => (
  <Text c="text-light" className={S.separator} flex="0 0 auto" fw="bold">
    /
  </Text>
);
