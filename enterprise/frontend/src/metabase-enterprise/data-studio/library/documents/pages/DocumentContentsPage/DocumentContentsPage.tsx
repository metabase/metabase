import { useMemo } from "react";
import { t } from "ttag";

import { useGetDocumentCardsQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type { Document } from "metabase-types/api";

import {
  type ContentOwner,
  ContentsTable,
} from "../../../components/ContentsTable";
import { DocumentPageShell } from "../../components/DocumentPageShell";

export function DocumentContentsPage() {
  return (
    <DocumentPageShell data-testid="document-contents-page">
      {(document) => <DocumentContents document={document} />}
    </DocumentPageShell>
  );
}

type DocumentContentsProps = {
  document: Document;
};

function DocumentContents({ document }: DocumentContentsProps) {
  const {
    data: response,
    isLoading,
    error,
  } = useGetDocumentCardsQuery({ id: document.id });
  const owner = useMemo<ContentOwner>(
    () => ({
      model: "document",
      id: document.id,
      name: document.name,
      collection_id: document.collection_id,
    }),
    [document.id, document.name, document.collection_id],
  );

  if (response == null || error != null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ContentsTable
      items={response.cards}
      owner={owner}
      emptyMessage={t`This document has no questions yet`}
    />
  );
}
