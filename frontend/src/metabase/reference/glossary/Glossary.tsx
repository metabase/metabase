import { useDisclosure } from "@mantine/hooks";
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
import {
  ColumnHeader,
  ItemCell,
  TBody,
  Table,
  TableColumn,
} from "metabase/common/components/ItemsTable/BaseItemsTable.styled";
import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Group,
  Icon,
  Menu,
  Popover,
  Stack,
  Text,
  rem,
} from "metabase/ui";

import { GlossaryEditDefinitionModal } from "./GlossarEditDefinitionModal";
import S from "./Glossary.module.css";
import { GlossaryNewDefinitionModal } from "./GlossaryNewDefinitionModal";

export function Glossary() {
  const [newDefinitionOpened, newDefinitionHandler] = useDisclosure();
  const [editingDefinition, setEditingDefinition] =
    useState<GlossaryItem | null>(null);
  const [deletingDefinition, setDeletingDefinition] =
    useState<GlossaryItem | null>(null);
  const [popoverDefinition, setPopoverDefinition] =
    useState<GlossaryItem | null>(null);

  const { data: glossary = [] } = useListGlossaryQuery();
  const [createGlossary] = useCreateGlossaryMutation();
  const [updateGlossary] = useUpdateGlossaryMutation();
  const [deleteGlossary] = useDeleteGlossaryMutation();

  return (
    <div>
      <Group
        align="center"
        wrap="nowrap"
        px="2.625rem"
        h="3rem"
        mt="2rem"
        mb="0.5rem"
        justify="space-between"
      >
        <Text fw="bold" fz="1.5rem">{t`Glossary`}</Text>

        <Button
          variant="default"
          size="sm"
          leftSection={<Icon name="add" />}
          onClick={newDefinitionHandler.open}
        >{t`New definition`}</Button>
      </Group>
      <div className={cx(CS.wrapper, CS.wrapperTrim)}>
        <Stack mb="lg" gap="xs" align="flex-start">
          <Text c="text-secondary">{t`Paragraph describing the motivation for this glossary and its purpose.`}</Text>
        </Stack>
        <Table>
          <colgroup>
            <TableColumn width="22.5%" />
            <TableColumn width="70%" />
            <TableColumn width="7.5%" />
          </colgroup>
          <thead>
            <tr>
              <ColumnHeader>{t`Term`}</ColumnHeader>
              <ColumnHeader>{t`Definition`}</ColumnHeader>
              <ColumnHeader />
            </tr>
          </thead>
          <TBody>
            {glossary.length === 0 && <EmptyGlossary />}
            {glossary.map((term, index) => {
              const popoverOpened = popoverDefinition?.id === term.id;

              return (
                <tr className={S.row} key={index}>
                  <Box component="td" valign="top">
                    <Text lh="1.2" fw="bold">
                      {term.term}
                    </Text>
                  </Box>
                  <Box
                    component="td"
                    valign="top"
                    pr="0"
                    style={{ wordBreak: "break-word" }}
                  >
                    <Text lh="1.2">{term.definition}</Text>
                  </Box>

                  <Box
                    component="td"
                    valign="top"
                    align="center"
                    px="md"
                    pt="sm"
                    pb={0}
                  >
                    <Popover
                      opened={popoverOpened}
                      onChange={() => setPopoverDefinition(null)}
                      width={rem(140)}
                      position="bottom-end"
                    >
                      <Popover.Target>
                        <ActionIcon
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
                              setEditingDefinition({
                                id: term.id,
                                term: term.term,
                                definition: term.definition,
                              });
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
                </tr>
              );
            })}
          </TBody>
        </Table>
      </div>

      <GlossaryNewDefinitionModal
        opened={newDefinitionOpened}
        onClose={newDefinitionHandler.close}
        onSubmit={(term, definition) => {
          void createGlossary({ term, definition });
        }}
      />

      <GlossaryEditDefinitionModal
        id={editingDefinition?.id}
        term={editingDefinition?.term}
        definition={editingDefinition?.definition}
        opened={editingDefinition !== null}
        onClose={() => setEditingDefinition(null)}
        onSubmit={(id, term, definition) => {
          void updateGlossary({ id, term, definition });
        }}
      />

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
    </div>
  );
}

function EmptyGlossary() {
  return (
    <tr>
      <ItemCell colSpan={3}>
        <Center p="sm">
          <Text
            c="text-secondary
          "
          >{t`No terms found.`}</Text>
        </Center>
      </ItemCell>
    </tr>
  );
}
