import { t } from "ttag";

import {
  useCreateGlossaryMutation,
  useDeleteGlossaryMutation,
  useListGlossaryQuery,
  useUpdateGlossaryMutation,
} from "metabase/api";
import { Card, Stack, Text } from "metabase/ui";

import S from "./Glossary.module.css";
import { GlossaryTable } from "./GlossaryTable";

export function GlossaryContainer() {
  const { data: glossary = [] } = useListGlossaryQuery();
  const [createGlossary] = useCreateGlossaryMutation();
  const [updateGlossary] = useUpdateGlossaryMutation();
  const [deleteGlossary] = useDeleteGlossaryMutation();

  return (
    <Stack w="100%" h="100%" align="center" py="xl" px="lg" maw="60rem" mx="auto">
      <Text fw="bold" fz="1.5rem" mb="lg" component="div" w="100%">{t`Glossary`}</Text>
      <Stack
        w="100%"
        gap={0}
        m={0}
      >
        <Card pb="sm" withBorder shadow="none">
          <GlossaryTable
            className={S.table}
            glossary={glossary}
            onCreate={async (term, definition) => {
              await createGlossary({ term, definition });
            }}
            onEdit={async (id, term, definition) => {
              await updateGlossary({ id, term, definition });
            }}
            onDelete={async (id) => {
              await deleteGlossary({ id });
            }}
          />
        </Card>
      </Stack>
    </Stack>
  );
}
