import { Link } from "react-router";
import { t } from "ttag";

import {
  skipToken,
  useGetTableQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import { Box, Group, Icon, Text } from "metabase/ui";
import type { TableId } from "metabase-types/api";

import S from "./Nav.module.css";
import { NavButton } from "./NavButton";
import { getExploreTableUrl } from "./utils";

interface Props {
  tableId: TableId;
  onBackClick?: () => void;
  onNextClick?: () => void;
  onPreviousClick?: () => void;
}

export const Nav = ({
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
        <Box
          c="text-light"
          className={S.breadcrumb}
          component={Link}
          flex="0 0 auto"
          fw="bold"
          to={`/browse/databases/${table.db_id}`}
        >
          <Group align="center" gap={10} wrap="nowrap">
            <Icon flex="0 0 auto" name="database" size={20} />

            <Box>{table.db.name}</Box>
          </Group>
        </Box>

        {schemas && schemas.length > 1 && table.schema && (
          <>
            <Separator />

            <Box
              c="text-light"
              className={S.breadcrumb}
              component={Link}
              flex="0 0 auto"
              fw="bold"
              to={`/browse/databases/${table.db_id}/schema/${table.schema}`}
            >
              {table.schema}
            </Box>
          </>
        )}

        <Separator />

        <Box
          c="text-light"
          className={S.breadcrumb}
          component={Link}
          flex="0 0 auto"
          fw="bold"
          to={getExploreTableUrl(table)}
        >
          {table.display_name}
        </Box>
      </Group>
    </Group>
  );
};

const Separator = () => (
  <Text c="text-light" className={S.separator} flex="0 0 auto" fw="bold">
    /
  </Text>
);
