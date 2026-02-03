import { t } from "ttag";

import {
  useCreateGlossaryMutation,
  useDeleteGlossaryMutation,
  useListGlossaryQuery,
  useUpdateGlossaryMutation,
} from "metabase/api";
import { GlossaryTable } from "metabase/reference/glossary/GlossaryTable";
import { Box, Card } from "metabase/ui";
import {
  trackDataStudioGlossaryTermCreated,
  trackDataStudioGlossaryTermDeleted,
  trackDataStudioGlossaryTermUpdated,
} from "metabase-enterprise/data-studio/analytics";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";

import S from "./GlossaryPage.module.css";

export function GlossaryPage() {
  const { data: glossary = [] } = useListGlossaryQuery();
  const [createGlossary] = useCreateGlossaryMutation();
  const [updateGlossary] = useUpdateGlossaryMutation();
  const [deleteGlossary] = useDeleteGlossaryMutation();

  return (
    <PageContainer gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs role="heading">{t`Glossary`}</DataStudioBreadcrumbs>
        }
      />
      <Box w="100%" className={S.contentWrapper}>
        <Card px="lg" pb="sm" withBorder shadow="none">
          <GlossaryTable
            glossary={glossary}
            onCreate={async (term, definition) => {
              const { data } = await createGlossary({ term, definition });
              if (data?.id) {
                trackDataStudioGlossaryTermCreated(data.id);
              }
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
    </PageContainer>
  );
}
