import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import type { GlossaryItem } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Table as CommonTable } from "metabase/common/components/Table/Table";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Group,
  Icon,
  Text,
  Tooltip,
} from "metabase/ui";
import { SortDirection } from "metabase-types/api/sorting";

import S from "./Glossary.module.css";
import { GlossaryRowEditor } from "./GlossaryRowEditor";

export type GlossaryTableProps = {
  className?: string;
  glossary: GlossaryItem[];
  onCreate: (term: string, definition: string) => Promise<void> | void;
  onEdit: (
    id: number,
    term: string,
    definition: string,
  ) => Promise<void> | void;
  onDelete: (id: number) => Promise<void> | void;
};

export function GlossaryTable({
  className,
  glossary,
  onCreate,
  onEdit,
  onDelete,
}: GlossaryTableProps) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<
    "term" | "definition" | null
  >(null);
  const [deletingItem, setDeletingItem] = useState<GlossaryItem | null>(null);
  const [sortColumnName, setSortColumnName] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    SortDirection.Asc,
  );

  const sortedRows = useMemo(() => {
    if (!sortColumnName) {
      return [
        ...(creating ? [{ id: "__create__", kind: "create" as const }] : []),
        ...glossary,
      ];
    }
    const data = glossary.toSorted((a, b) => {
      const ak = (a as any)[sortColumnName] ?? "";
      const bk = (b as any)[sortColumnName] ?? "";
      const cmp = String(ak).localeCompare(String(bk));
      return sortDirection === SortDirection.Asc ? cmp : -cmp;
    });
    return [
      ...(creating ? [{ id: "__create__", kind: "create" as const }] : []),
      ...data,
    ];
  }, [creating, glossary, sortColumnName, sortDirection]);

  return (
    <>
      <Group justify="flex-end" mb="xs">
        <Button
          variant="default"
          size="sm"
          leftSection={<Icon name="add" />}
          onClick={() => setCreating(true)}
        >
          {t`New term`}
        </Button>
      </Group>
      <CommonTable
        className={cx(S.table, className)}
        columns={[
          { name: t`Term`, key: "term", sortable: true },
          { name: t`Definition`, key: "definition", sortable: true },
          { name: "", key: "actions", sortable: false },
        ]}
        rows={sortedRows}
        cols={
          <>
            <col style={{ minWidth: "22.5%", maxWidth: "22.5%" }} />
            <col style={{ width: "70%" }} />
            <col style={{ width: "7.5%" }} />
          </>
        }
        emptyBody={
          <Center>
            <Text c="text-secondary">{t`No terms found.`}</Text>
          </Center>
        }
        sortColumnName={sortColumnName}
        sortDirection={sortDirection}
        onSort={(column, dir) => {
          setSortColumnName(column);
          setSortDirection(dir);
        }}
        rowRenderer={(row) => {
          // Create row
          if ((row as any).kind === "create") {
            return (
              <tr className={cx(S.row, S.rowEditor)}>
                <GlossaryRowEditor
                  mode="create"
                  item={{ term: "", definition: "" }}
                  onCancel={() => setCreating(false)}
                  onSave={async (term, definition) => {
                    await onCreate(term, definition);
                    setCreating(false);
                  }}
                />
              </tr>
            );
          }

          const item = row as GlossaryItem;
          const isEditing = editingId === item.id;

          return (
            <tr className={cx(S.row, { [S.rowEditor]: isEditing })}>
              {isEditing ? (
                <GlossaryRowEditor
                  mode="edit"
                  item={item}
                  autoFocusField={editingField ?? "term"}
                  onCancel={() => setEditingId(null)}
                  onSave={async (newTerm, newDefinition) => {
                    await onEdit(item.id, newTerm, newDefinition);
                    setEditingId(null);
                    setEditingField(null);
                  }}
                />
              ) : (
                <>
                  <Box
                    component="td"
                    valign="top"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingField("term");
                    }}
                  >
                    <Text lh="1.2" fw="bold" pt="xs">
                      {item.term}
                    </Text>
                  </Box>
                  <Box
                    component="td"
                    valign="top"
                    style={{ wordBreak: "break-word" }}
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingField("definition");
                    }}
                  >
                    <Text lh="1.2" pt="xs">
                      {item.definition}
                    </Text>
                  </Box>

                  <Box component="td" valign="top" align="center" p="sm">
                    <Tooltip label={t`Delete`}>
                      <ActionIcon
                        aria-label={t`Delete`}
                        variant="subtle"
                        c="text-light"
                        className={cx(S.action)}
                        onClick={() => setDeletingItem(item)}
                      >
                        <Icon name="trash" />
                      </ActionIcon>
                    </Tooltip>
                  </Box>
                </>
              )}
            </tr>
          );
        }}
      />
      <ConfirmModal
        opened={deletingItem != null}
        title={t`Delete “${deletingItem?.term}”`}
        confirmButtonText={t`Delete`}
        onClose={() => setDeletingItem(null)}
        onConfirm={async () => {
          if (deletingItem) {
            await onDelete(deletingItem.id);
            setDeletingItem(null);
          }
        }}
      />
    </>
  );
}
