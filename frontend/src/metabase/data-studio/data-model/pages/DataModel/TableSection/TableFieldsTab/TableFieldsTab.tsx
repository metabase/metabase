import { type ReactNode, useCallback, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { FieldOrderPicker } from "metabase/metadata/components";
import { TableFieldList } from "metabase/metadata/components/TableFieldList";
import { TableSortableFieldList } from "metabase/metadata/components/TableSortableFieldList";
import { useTableUpdateHandlers } from "metabase/metadata/hooks";
import { useChangingAttributes } from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Button, Icon, Loader, Stack } from "metabase/ui";
import type { Field, FieldId, Table } from "metabase-types/api";

import {
  ChangingFieldsGroup,
  useGroupMembers,
} from "../../FieldDetailsPanel/ChangesOverTime";
import {
  ListSearchBar,
  ListSearchEmptyState,
  matchesListSearch,
} from "../ListSearchBar";
import S from "../TableSection.module.css";

interface TableFieldsTabProps {
  table: Table;
  activeFieldId?: FieldId;
  getFieldHref: (fieldId: FieldId) => string;
  /** More buttons beside Sorting, hidden while sorting */
  actions?: ReactNode;
}

/** The table's fields, searchable, with sorting beside the search */
export function TableFieldsTab({
  table,
  activeFieldId,
  getFieldHref,
  actions,
}: TableFieldsTabProps) {
  const {
    handleFieldOrderTypeChange,
    handleCustomFieldOrderChange,
    isUpdatingSorting,
  } = useTableUpdateHandlers({ table });
  const [isSorting, setIsSorting] = useState(false);
  const [query, setQuery] = useState("");
  const readOnly = !table.can_write;
  const fields = table.fields ?? [];

  const filterField = useCallback(
    (field: Field) => matchesListSearch(query, field.display_name, field.name),
    [query],
  );
  const hasMatches = fields.some(filterField);
  const { variant } = useChangingAttributes();
  const { history, memberIds } = useGroupMembers(table);
  const isTracked = (field: Field) =>
    memberIds.includes(getRawTableFieldId(field));
  const groupHistoryTable =
    variant === "group" ? history.historyTable : undefined;

  if (fields.length === 0) {
    return (
      <EmptyState
        className={S.EmptyState}
        message={t`This table has no fields`}
        spacing="sm"
      />
    );
  }

  return (
    <Stack gap="lg">
      {/* Sorting drags the full list, so search waits until it's done */}
      <ListSearchBar
        value={query}
        placeholder={t`Search fields`}
        disabled={isSorting}
        onChange={setQuery}
      >
        {!isSorting && !readOnly && (
          <Button
            leftSection={<Icon name="sort_arrows" />}
            onClick={() => setIsSorting(true)}
          >{t`Sorting`}</Button>
        )}
        {!isSorting && actions}
        {isSorting && (
          <FieldOrderPicker
            value={table.field_order}
            onChange={handleFieldOrderTypeChange}
          />
        )}
        {isSorting && (
          <Button
            leftSection={<Icon name="check" />}
            onClick={() => setIsSorting(false)}
          >{t`Done`}</Button>
        )}
        {isUpdatingSorting && <Loader size="xs" />}
      </ListSearchBar>

      <Box
        style={{ display: isSorting ? "block" : "none" }}
        aria-hidden={!isSorting}
      >
        <TableSortableFieldList
          activeFieldId={activeFieldId}
          table={table}
          onChange={handleCustomFieldOrderChange}
        />
      </Box>

      <Box
        style={{ display: isSorting ? "none" : "block" }}
        aria-hidden={isSorting}
      >
        {hasMatches && groupHistoryTable != null && (
          <Stack gap="xl">
            <TableFieldList
              table={table}
              activeFieldId={activeFieldId}
              filterField={(field) => filterField(field) && !isTracked(field)}
              getFieldHref={getFieldHref}
            />
            <ChangingFieldsGroup
              table={table}
              history={history}
              historyTable={groupHistoryTable}
              memberFields={fields.filter(isTracked)}
              readOnly={readOnly}
            >
              <TableFieldList
                table={table}
                activeFieldId={activeFieldId}
                filterField={(field) => filterField(field) && isTracked(field)}
                getFieldHref={getFieldHref}
              />
            </ChangingFieldsGroup>
          </Stack>
        )}
        {hasMatches && groupHistoryTable == null && (
          <TableFieldList
            table={table}
            activeFieldId={activeFieldId}
            filterField={filterField}
            getFieldHref={getFieldHref}
          />
        )}
        {!hasMatches && (
          <ListSearchEmptyState>{t`No fields match "${query}"`}</ListSearchEmptyState>
        )}
      </Box>
    </Stack>
  );
}
