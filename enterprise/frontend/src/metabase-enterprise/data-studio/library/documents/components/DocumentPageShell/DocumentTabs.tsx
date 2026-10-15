import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import * as Urls from "metabase/urls";
import type { DocumentId } from "metabase-types/api";

type DocumentTabsProps = {
  documentId: DocumentId;
};

export function DocumentTabs({ documentId }: DocumentTabsProps) {
  const tabs: PillTab[] = [
    { label: t`Overview`, to: Urls.dataStudioDocument(documentId) },
    { label: t`Contents`, to: Urls.dataStudioDocumentContents(documentId) },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            label: t`Dependencies`,
            to: Urls.dataStudioDocumentDependencies(documentId),
          },
        ]
      : []),
    { label: t`History`, to: Urls.dataStudioDocumentHistory(documentId) },
  ];

  return <PillTabNavigation tabs={tabs} />;
}
