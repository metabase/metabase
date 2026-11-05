import { t } from "ttag";

import { Glossary } from "metabase/common/components/Glossary/Glossary";
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

  return (
    <PageContainer gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs role="heading">{t`Glossary`}</DataStudioBreadcrumbs>
        }
      />
      <Glossary
        onCreated={trackDataStudioGlossaryTermCreated}
        onUpdated={trackDataStudioGlossaryTermUpdated}
        onDeleted={trackDataStudioGlossaryTermDeleted}
      />
    </PageContainer>
  );
}
