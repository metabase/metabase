import { t } from "ttag";

import { PublishedTableBreadcrumbs } from "metabase/data-studio/common/components/PublishedTableBreadcrumbs";
import * as Urls from "metabase/urls";

import { SystemSegmentPage } from "../DataModelSystemSegmentPage";

export function PublishedTableSystemSegmentPage() {
  return (
    <SystemSegmentPage
      renderBreadcrumbs={({ table, segment }) => (
        <PublishedTableBreadcrumbs
          table={table}
          entityName={segment.label}
          newEntityLabel={t`New segment`}
          tableListUrl={Urls.dataStudioTableSegments(table.id)}
        />
      )}
    />
  );
}
