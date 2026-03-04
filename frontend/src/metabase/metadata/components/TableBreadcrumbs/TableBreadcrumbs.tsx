import cx from "classnames";

import {
  skipToken,
  useGetCardQuery,
  useGetTableQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Flex, Group, Icon } from "metabase/ui";
import {
  getQuestionIdFromVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/v1/metadata/utils/saved-questions";
import type { TableId, WrappedCardId } from "metabase-types/api";

import S from "./TableBreadcrumbs.module.css";

interface Props {
  className?: string;
  hideTableName?: boolean;
  tableId: TableId | WrappedCardId;
}

export const TableBreadcrumbs = ({
  className,
  hideTableName,
  tableId,
}: Props) => {
  const isCard = isVirtualCardId(tableId);

  const { data: table } = useGetTableQuery(
    isCard ? skipToken : { id: tableId },
  );
  const { data: card } = useGetCardQuery(
    isCard ? { id: getQuestionIdFromVirtualTableId(tableId) } : skipToken,
  );

  const { data: schemas, isLoading: isLoadingSchemas } =
    useListDatabaseSchemasQuery(
      table && table.db_id && table.schema ? { id: table.db_id } : skipToken,
    );

  if (!table || !table.db || isLoadingSchemas) {
    return null;
  }

  return (
    <Group
      align="center"
      className={cx(S.breadcrumbs, className)}
      gap="sm"
      wrap="nowrap"
    >
      <Group align="center" className={S.breadcrumb} gap="xs" wrap="nowrap">
        <Flex>
          <Icon name="database" />
        </Flex>

        <Ellipsified>{table.db.name}</Ellipsified>
      </Group>

      {schemas && schemas.length > 1 && table.schema && (
        <>
          <Separator />

          <Group align="center" className={S.breadcrumb} gap="xs" wrap="nowrap">
            <Flex>
              <Icon name="folder" />
            </Flex>

            <Ellipsified>{table.schema}</Ellipsified>
          </Group>
        </>
      )}

      {!hideTableName && (
        <>
          <Separator />

          <Group align="center" className={S.breadcrumb} gap="xs" wrap="nowrap">
            <Flex>
              <Icon name="table" />
            </Flex>

            <Ellipsified>{table.display_name}</Ellipsified>
          </Group>
        </>
      )}
    </Group>
  );
};

const Separator = () => <span>/</span>;
