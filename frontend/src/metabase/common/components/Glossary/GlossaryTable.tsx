import type { KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import type { GlossaryItem } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { NoObjectError } from "metabase/common/components/errors/NoObjectError";
import {
  Box,
  Button,
  Card,
  Center,
  Flex,
  Icon,
  SortableHeaderPill,
  Stack,
  TextInput,
} from "metabase/ui";
import type { SortDirection } from "metabase-types/api";

import { EmptyState } from "../EmptyState";

import S from "./Glossary.module.css";
import { GlossaryNewRow } from "./GlossaryNewRow";
import { GlossaryRow } from "./GlossaryRow";

type SortColumn = "term" | "definition";

export type GlossaryTableProps = {
  glossary: GlossaryItem[];
  readOnly?: boolean;
  onCreate?: (term: string, definition: string) => Promise<void> | void;
  onEdit?: (
    id: number,
    term: string,
    definition: string,
  ) => Promise<void> | void;
  onDelete?: (id: number) => Promise<void> | void;
};

export function GlossaryTable({
  glossary,
  readOnly = false,
  onCreate,
  onEdit,
  onDelete,
}: GlossaryTableProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingItem, setDeletingItem] = useState<GlossaryItem | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const trimmedSearchQuery = searchQuery.trim();
  const rows = useMemo(() => {
    const filtered = filterGlossary(glossary, trimmedSearchQuery);
    if (!sortColumn) {
      return filtered;
    }
    return filtered.toSorted((a, b) => {
      const cmp = a[sortColumn].localeCompare(b[sortColumn]);
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [glossary, trimmedSearchQuery, sortColumn, sortDirection]);

  const terms = useMemo(() => glossary.map((item) => item.term), [glossary]);

  const handleSort = (column: SortColumn) => {
    const isAscending = sortColumn === column && sortDirection === "asc";
    setSortColumn(column);
    setSortDirection(isAscending ? "desc" : "asc");
  };

  const renderHeader = (column: SortColumn, name: string) => {
    const sort = sortColumn === column ? sortDirection : undefined;
    return (
      <th
        aria-sort={
          sort ? (sort === "asc" ? "ascending" : "descending") : undefined
        }
        tabIndex={0}
        onClick={() => handleSort(column)}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleSort(column);
          }
        }}
      >
        <Flex>
          <SortableHeaderPill name={name} sort={sort} />
        </Flex>
      </th>
    );
  };

  return (
    <Stack flex={1} mih={0}>
      <Flex gap="lg">
        <TextInput
          placeholder={t`Search...`}
          leftSection={<Icon name="search" />}
          bdrs="sm"
          flex="1"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        {!readOnly && (
          <Button
            size="lg"
            leftSection={<Icon name="add" size={16} />}
            onClick={() => setIsCreating(true)}
          >
            {t`New term`}
          </Button>
        )}
      </Flex>
      <Card withBorder shadow="none" p={0} mih={0}>
        <Box className={S.scrollArea}>
          <table className={S.table}>
            <colgroup>
              <col style={{ width: "22.5%" }} />
              <col />
              <col style={{ width: "4rem" }} />
            </colgroup>
            <thead>
              <tr>
                {renderHeader("term", t`Term`)}
                {renderHeader("definition", t`Definition`)}
                <th />
              </tr>
            </thead>
            <tbody>
              {isCreating && (
                <GlossaryNewRow
                  existingTerms={terms}
                  onSave={(term, definition) => {
                    setIsCreating(false);
                    void onCreate?.(term, definition);
                  }}
                  onCancel={() => setIsCreating(false)}
                />
              )}
              {rows.map((item) => (
                <GlossaryRow
                  key={item.id}
                  item={item}
                  otherTerms={terms.filter((term) => term !== item.term)}
                  readOnly={readOnly}
                  onEdit={onEdit}
                  onDeleteClick={setDeletingItem}
                />
              ))}
              {!isCreating && rows.length === 0 && (
                <tr>
                  <td colSpan={3}>
                    <Center>
                      <Box mb="lg">
                        <EmptyState
                          message={
                            trimmedSearchQuery
                              ? t`No results for "${trimmedSearchQuery}"`
                              : t`No terms yet`
                          }
                          illustrationElement={<NoObjectError mb="-1.5rem" />}
                        />
                      </Box>
                    </Center>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Box>
      </Card>
      <ConfirmModal
        opened={deletingItem != null}
        title={t`Delete “${deletingItem?.term}”?`}
        confirmButtonText={t`Delete`}
        message={t`This can't be undone.`}
        onClose={() => setDeletingItem(null)}
        onConfirm={async () => {
          if (deletingItem) {
            await onDelete?.(deletingItem.id);
            setDeletingItem(null);
          }
        }}
      />
    </Stack>
  );
}

function filterGlossary(glossary: GlossaryItem[], searchQuery: string) {
  if (!searchQuery) {
    return glossary;
  }
  const normalizedQuery = searchQuery.toLocaleLowerCase();
  return glossary.filter(
    ({ term, definition }) =>
      term.toLocaleLowerCase().includes(normalizedQuery) ||
      definition.toLocaleLowerCase().includes(normalizedQuery),
  );
}
