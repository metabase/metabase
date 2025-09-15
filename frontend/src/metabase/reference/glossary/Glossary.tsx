import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import {
  type GlossaryItem,
  useCreateGlossaryMutation,
  useDeleteGlossaryMutation,
  useListGlossaryQuery,
  useUpdateGlossaryMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Table as CommonTable } from "metabase/common/components/Table/Table";
import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Center,
  Group,
  Icon,
  Menu,
  Popover,
  Stack,
  Text,
  rem,
} from "metabase/ui";

import S from "./Glossary.module.css";
import { GlossaryRowEditor } from "./GlossaryRowEditor";

export function Glossary() {
  const [deletingDefinition, setDeletingDefinition] =
    useState<GlossaryItem | null>(null);
  const [popoverDefinition, setPopoverDefinition] =
    useState<GlossaryItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: glossary = [] } = useListGlossaryQuery();
  const [createGlossary] = useCreateGlossaryMutation();
  const [updateGlossary] = useUpdateGlossaryMutation();
  const [deleteGlossary] = useDeleteGlossaryMutation();

  return (
    <Stack w="100%">
      <Group
        align="center"
        wrap="nowrap"
        px="2.625rem"
        h="3rem"
        mt="2rem"
        justify="space-between"
      >
        <Text fw="bold" fz="1.5rem">{t`Glossary`}</Text>

        <Button
          variant="default"
          size="sm"
          leftSection={<Icon name="add" />}
          onClick={() => {
            setCreating(true);
          }}
        >{t`New definition`}</Button>
      </Group>
      <Stack w="100%" gap={0} className={cx(CS.wrapper, CS.wrapperTrim)}>
        <Card px="lg" className={cx(CS.bordered, S.card)}>
          <CommonTable
            className={S.table}
            columns={[
              { name: t`Term`, key: "term", sortable: false },
              { name: t`Definition`, key: "definition", sortable: false },
              { name: "", key: "actions", sortable: false },
            ]}
            rows={
              [
                ...(creating
                  ? ([{ id: "__create__", kind: "create" }] as const)
                  : []),
                ...glossary,
              ] as Array<GlossaryItem | { id: string; kind: "create" }>
            }
            cols={
              <>
                <col style={{ minWidth: "22.5%", maxWidth: "22.5%" }} />
                <col style={{ width: "70%" }} />
                <col style={{ width: "7.5%" }} />
              </>
            }
            emptyBody={<EmptyGlossaryBody />}
            rowRenderer={(row) => {
              // Create row
              if ((row as any).kind === "create") {
                return (
                  <tr className={S.row}>
                    <GlossaryRowEditor
                      mode="create"
                      item={{ term: "", definition: "" }}
                      onCancel={() => setCreating(false)}
                      onSave={async (term, definition) => {
                        await createGlossary({ term, definition });
                        setCreating(false);
                      }}
                    />
                  </tr>
                );
              }

              const term = row as GlossaryItem;
              const popoverOpened = popoverDefinition?.id === term.id;
              const isEditing = editingId === term.id;

              return (
                <tr className={S.row}>
                  {isEditing ? (
                    <GlossaryRowEditor
                      mode="edit"
                      item={term}
                      onCancel={() => setEditingId(null)}
                      onSave={async (newTerm, newDefinition) => {
                        await updateGlossary({
                          id: term.id,
                          term: newTerm,
                          definition: newDefinition,
                        });
                        setEditingId(null);
                      }}
                    />
                  ) : (
                    <>
                      <Box component="td" valign="top">
                        <Text lh="1.2" fw="bold" pt="xs">
                          {term.term}
                        </Text>
                      </Box>
                      <Box
                        component="td"
                        valign="top"
                        style={{ wordBreak: "break-word" }}
                      >
                        <Text lh="1.2" pt="xs">
                          {term.definition}
                        </Text>
                      </Box>

                      <Box
                        component="td"
                        valign="top"
                        align="center"
                        p="sm"
                        // pt="md"
                      >
                        <Popover
                          opened={popoverOpened}
                          onChange={() => setPopoverDefinition(null)}
                          width={rem(140)}
                          position="bottom-end"
                        >
                          <Popover.Target>
                            <ActionIcon
                              variant="subtle"
                              c="text-light"
                              className={cx(S.action, {
                                [S.visible]: popoverOpened,
                              })}
                              onClick={() =>
                                setPopoverDefinition((definition) =>
                                  definition === term ? null : term,
                                )
                              }
                            >
                              <Icon name="ellipsis" />
                            </ActionIcon>
                          </Popover.Target>

                          <Popover.Dropdown p="xs">
                            <Menu>
                              <Menu.Item
                                leftSection={<Icon name="pencil" />}
                                onClick={() => {
                                  setEditingId(term.id);
                                  setPopoverDefinition(null);
                                }}
                              >
                                {t`Edit`}
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<Icon name="trash" />}
                                data-testid="comment-action-panel-delete"
                                onClick={() => {
                                  setDeletingDefinition({
                                    id: term.id,
                                    term: term.term,
                                    definition: term.definition,
                                  });
                                  setPopoverDefinition(null);
                                }}
                              >
                                {t`Delete`}
                              </Menu.Item>
                            </Menu>
                          </Popover.Dropdown>
                        </Popover>
                      </Box>
                    </>
                  )}
                </tr>
              );
            }}
          />
        </Card>

        <ConfirmModal
          confirmButtonText={t`Delete`}
          opened={deletingDefinition != null}
          title={t`Delete “${deletingDefinition?.term}”`}
          onClose={() => setDeletingDefinition(null)}
          onConfirm={() => {
            if (deletingDefinition) {
              void deleteGlossary({ id: deletingDefinition.id });
              setDeletingDefinition(null);
            }
          }}
        />
      </Stack>
    </Stack>
  );
}

function EmptyGlossaryBody() {
  return (
    <Center p="sm">
      <Text c="text-secondary">{t`No terms found.`}</Text>
    </Center>
  );
}

// (Old EmptyGlossary table row-based component removed in favor of CommonTable's emptyBody)
