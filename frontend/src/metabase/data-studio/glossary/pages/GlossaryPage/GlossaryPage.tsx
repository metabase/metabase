import { t } from "ttag";

import { useListGlossaryQuery } from "metabase/api";
import { GlossaryDescription } from "metabase/common/components/Glossary/GlossaryDescription";
import { GlossaryTable } from "metabase/common/components/Glossary/GlossaryTable";
import { useGlossaryMutations } from "metabase/common/components/Glossary/use-glossary-mutations";
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
  const { createTerm, updateTerm, deleteTerm } = useGlossaryMutations({
    onCreated: trackDataStudioGlossaryTermCreated,
    onUpdated: trackDataStudioGlossaryTermUpdated,
    onDeleted: trackDataStudioGlossaryTermDeleted,
  });

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
        onCreate={createTerm}
        onEdit={updateTerm}
        onDelete={deleteTerm}
      />
    </PageContainer>
  );
}
