import { t } from "ttag";

import {
  useCreateGlossaryMutation,
  useDeleteGlossaryMutation,
  useListGlossaryQuery,
  useUpdateGlossaryMutation,
} from "metabase/api";
import { GlossaryTable } from "metabase/reference/glossary/GlossaryTable";
import { Box, Card, Group, Stack, Text } from "metabase/ui";
import {
  trackDataStudioGlossaryTermCreated,
  trackDataStudioGlossaryTermDeleted,
  trackDataStudioGlossaryTermUpdated,
} from "metabase-enterprise/data-studio/analytics";

import S from "./GlossaryPage.module.css";

export function GlossaryPage() {
  const { data: glossary = [] } = useListGlossaryQuery();
  const [createGlossary] = useCreateGlossaryMutation();
  const [updateGlossary] = useUpdateGlossaryMutation();
  const [deleteGlossary] = useDeleteGlossaryMutation();

  return (
    <Stack w="100%" h="100%" p="xl" bg="background-secondary">
      <Group align="center" wrap="nowrap" justify="space-between">
        <Text fw="bold" fz="1.5rem" component="h1">{t`Glossary`}</Text>
      </Group>
      <Box w="100%" className={S.contentWrapper}>
        <Card px="lg" pb="sm" withBorder shadow="none">
          <GlossaryTable
            glossary={glossary}
            onCreate={async (term, definition) => {
              const { data } = await createGlossary({ term, definition });
              data?.id && trackDataStudioGlossaryTermCreated(data.id);
            }}
            onEdit={async (id, term, definition) => {
              await updateGlossary({ id, term, definition });
              trackDataStudioGlossaryTermUpdated(id);
            }}
            onDelete={async (id) => {
              await deleteGlossary({ id });
              trackDataStudioGlossaryTermDeleted(id);
            }}
          />
        </Card>
      </Box>
    </Stack>
  );
}
