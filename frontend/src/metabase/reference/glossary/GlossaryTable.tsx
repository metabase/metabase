import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/actions/containers/ActionPicker/ActionPicker.styled";
import type { GlossaryItem } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Table as CommonTable } from "metabase/common/components/Table/Table";
import { NoObjectError } from "metabase/common/components/errors/NoObjectError";
import { useHasTokenFeature } from "metabase/common/hooks";
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

  const hasMetabot = useHasTokenFeature("metabot_v3");

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
      <Group justify="space-between" mb="xs">
        <Text>
          {hasMetabot
            ? t`Define terms to help your team and Metabot understand your data.`
            : t`Define terms to help your team understand your data.`}
        </Text>
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
            <col style={{ width: "22.5%" }} />
            <col style={{ width: "65%" }} />
            <col style={{ width: "5rem" }} />
          </>
        }
        emptyBody={
          <Center>
            <EmptyState
              message={t`No terms yet`}
              illustrationElement={<NoObjectError mb="-1.5rem" />}
            />
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
                    style={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingField("definition");
                    }}
                  >
                    <Text lh="1.2" pt="xs">
                      {item.definition}
                    </Text>
                  </Box>

                  <Box
                    component="td"
                    valign="top"
                    align="center"
                    p="sm"
                    w="25px"
                  >
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
        title={t`Delete “${deletingItem?.term}”?`}
        confirmButtonText={t`Delete`}
        message={t`This can't be undone.`}
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
