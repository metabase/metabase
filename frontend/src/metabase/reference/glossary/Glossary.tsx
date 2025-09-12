import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import {
  ColumnHeader,
  ItemCell,
  TBody,
  Table,
  TableColumn,
} from "metabase/common/components/ItemsTable/BaseItemsTable.styled";
import CS from "metabase/css/core/index.css";
import { Box, Button, Center, Group, Icon, Stack, Text } from "metabase/ui";

import { GlossaryEditDefinitionModal } from "./GlossarEditDefinitionModal";
import { GlossaryNewDefinitionModal } from "./GlossaryNewDefinitionModal";
import {
  type GlossaryDefinition,
  useMockedGlossary,
} from "./use-mocked-glossary";

export function Glossary() {
  const [newDefinitionOpened, newDefinitionHandler] = useDisclosure();
  const [editingDefinition, setEditingDefinition] =
    useState<GlossaryDefinition | null>(null);

  const { mockedGlossary, addDefinition, updateDefinition, deleteDefinition } =
    useMockedGlossary();

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
            {mockedGlossary.length === 0 && <EmptyGlossary />}
            {mockedGlossary.map((term, index) => (
              <tr key={index}>
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
                <Box component="td" valign="top" px="0" align="center">
                  <Icon
                    name="pencil"
                    c="text-light"
                    cursor="pointer"
                    mt={-2} // prevent the row of 1-line definitions from growing
                    onClick={() =>
                      setEditingDefinition({
                        id: term.id,
                        term: term.term,
                        definition: term.definition,
                      })
                    }
                  />
                </Box>
              </tr>
            ))}
          </TBody>
        </Table>
      </div>

      <GlossaryNewDefinitionModal
        opened={newDefinitionOpened}
        onClose={newDefinitionHandler.close}
        onSubmit={addDefinition}
      />

      <GlossaryEditDefinitionModal
        id={editingDefinition?.id}
        term={editingDefinition?.term}
        definition={editingDefinition?.definition}
        opened={editingDefinition !== null}
        onClose={() => setEditingDefinition(null)}
        onSubmit={updateDefinition}
        onDelete={deleteDefinition}
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
