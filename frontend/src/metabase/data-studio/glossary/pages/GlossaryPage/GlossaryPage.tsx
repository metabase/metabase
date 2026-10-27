import { t } from "ttag";

import {
  useCreateGlossaryMutation,
  useDeleteGlossaryMutation,
  useListGlossaryQuery,
  useUpdateGlossaryMutation,
} from "metabase/api";
import { GlossaryDescription } from "metabase/common/components/Glossary/GlossaryDescription";
import { GlossaryTable } from "metabase/common/components/Glossary/GlossaryTable";
import {
  trackDataStudioGlossaryTermCreated,
  trackDataStudioGlossaryTermDeleted,
  trackDataStudioGlossaryTermUpdated,
} from "metabase/common/data-studio/analytics";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { usePageTitle } from "metabase/hooks/use-page-title";

export function GlossaryPage() {
  usePageTitle(t`Glossary`);
  const { data } = useListGlossaryQuery();
  const glossary = data?.data ?? [];
  const canWrite = data?.can_write ?? false;
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
      <GlossaryDescription mb="lg" />
      <GlossaryTable
        glossary={glossary}
        readOnly={!canWrite}
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
    </PageContainer>
  );
}
