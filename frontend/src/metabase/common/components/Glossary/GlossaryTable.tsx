import type { AriaAttributes, KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import type {
  CreateGlossaryRequest,
  GlossaryItem,
  UpdateGlossaryRequest,
} from "metabase/api";
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
import type { GlossaryField, GlossarySort } from "./types";
import { getNextSort, getVisibleItems, isDuplicateTerm } from "./utils";

const TERM_COLUMN_WIDTH = "22.5%";
const ACTIONS_COLUMN_WIDTH = "4rem";
const COLUMN_COUNT = 3;

const EMPTY_DRAFT: CreateGlossaryRequest = { term: "", definition: "" };

const ARIA_SORT = {
  asc: "ascending",
  desc: "descending",
} as const satisfies Record<SortDirection, AriaAttributes["aria-sort"]>;

export type GlossaryTableProps = {
  glossary: GlossaryItem[];
  readOnly?: boolean;
  /** Resolves to whether the term was saved; the new row reopens with the draft when it was not. */
  onCreate: (draft: CreateGlossaryRequest) => Promise<boolean>;
  onEdit: (request: UpdateGlossaryRequest) => void;
  onDelete: (id: GlossaryItem["id"]) => Promise<void> | void;
};

export function GlossaryTable({
  glossary,
  readOnly = false,
  onCreate,
  onEdit,
  onDelete,
}: GlossaryTableProps) {
  const [newRowDraft, setNewRowDraft] = useState<CreateGlossaryRequest | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<GlossarySort | null>(null);
  const [deletingItem, setDeletingItem] = useState<GlossaryItem | null>(null);

  const trimmedSearchQuery = searchQuery.trim();
  const visibleItems = useMemo(
    () => getVisibleItems(glossary, trimmedSearchQuery, sort),
    [glossary, trimmedSearchQuery, sort],
  );

  const handleSort = (field: GlossaryField) => {
    setSort(getNextSort(sort, field));
  };

  const handleCreate = async (draft: CreateGlossaryRequest) => {
    // Close at once so the optimistic entry does not flag the open row's term as a duplicate
    setNewRowDraft(null);
    const isSaved = await onCreate(draft);
    if (!isSaved) {
      setNewRowDraft((currentDraft) => currentDraft ?? draft);
    }
  };

  const handleDelete = async () => {
    if (deletingItem) {
      await onDelete(deletingItem.id);
      setDeletingItem(null);
    }
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
            onClick={() => setNewRowDraft(EMPTY_DRAFT)}
          >
            {t`New term`}
          </Button>
        )}
      </Flex>
      <Card withBorder shadow="none" p={0} mih={0}>
        <Box className={S.scrollArea}>
          <table className={S.table}>
            <colgroup>
              <col style={{ width: TERM_COLUMN_WIDTH }} />
              <col />
              <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
            </colgroup>
            <thead>
              <tr>
                <SortableHeaderCell
                  name={t`Term`}
                  field="term"
                  sort={sort}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  name={t`Definition`}
                  field="definition"
                  sort={sort}
                  onSort={handleSort}
                />
                <th />
              </tr>
            </thead>
            <tbody>
              {newRowDraft != null && (
                <GlossaryNewRow
                  initialDraft={newRowDraft}
                  isDuplicateTerm={(term) => isDuplicateTerm(glossary, term)}
                  onSave={handleCreate}
                  onCancel={() => setNewRowDraft(null)}
                />
              )}
              {visibleItems.map((item) => (
                <GlossaryRow
                  key={item.id}
                  item={item}
                  readOnly={readOnly}
                  isDuplicateTerm={(term) =>
                    isDuplicateTerm(glossary, term, item.id)
                  }
                  onEdit={onEdit}
                  onDeleteClick={setDeletingItem}
                />
              ))}
              {newRowDraft == null && visibleItems.length === 0 && (
                <tr>
                  <td colSpan={COLUMN_COUNT}>
                    <Center mb="lg">
                      <EmptyState
                        message={
                          trimmedSearchQuery
                            ? t`No results for "${trimmedSearchQuery}"`
                            : t`No terms yet`
                        }
                        illustrationElement={<NoObjectError mb="-1.5rem" />}
                      />
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
        onConfirm={handleDelete}
      />
    </Stack>
  );
}

type SortableHeaderCellProps = {
  name: string;
  field: GlossaryField;
  sort: GlossarySort | null;
  onSort: (field: GlossaryField) => void;
};

function SortableHeaderCell({
  name,
  field,
  sort,
  onSort,
}: SortableHeaderCellProps) {
  const direction = sort?.field === field ? sort.direction : undefined;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSort(field);
    }
  };

  return (
    <th
      aria-sort={direction && ARIA_SORT[direction]}
      tabIndex={0}
      onClick={() => onSort(field)}
      onKeyDown={handleKeyDown}
    >
      <Flex>
        <SortableHeaderPill name={name} sort={direction} />
      </Flex>
    </th>
  );
}
