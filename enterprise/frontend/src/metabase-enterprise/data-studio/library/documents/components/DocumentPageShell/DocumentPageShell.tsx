import type { ReactNode } from "react";

import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import * as Urls from "metabase/urls";
import type { Document } from "metabase-types/api";

import { LibraryItemHeader } from "../../../components/LibraryItemHeader";
import { LibraryItemPageState } from "../../../components/LibraryItemPageState";
import { useRouteDocument } from "../../hooks/use-route-document";

import { DocumentHeaderActions } from "./DocumentHeaderActions";
import { DocumentTabs } from "./DocumentTabs";

type DocumentPageShellProps = {
  "data-testid": string;
  children: (document: Document) => ReactNode;
};

export function DocumentPageShell({
  "data-testid": dataTestId,
  children,
}: DocumentPageShellProps) {
  const { document, isLoading, error } = useRouteDocument();

  return (
    <LibraryItemPageState
      model="document"
      item={document}
      isLoading={isLoading}
      error={error}
      getItemUrl={Urls.document}
    >
      {(document, folders) => (
        <PageContainer data-testid={dataTestId}>
          <LibraryItemHeader
            model="document"
            item={document}
            folders={folders}
            tabs={<DocumentTabs documentId={document.id} />}
            actions={<DocumentHeaderActions document={document} />}
          />
          {children(document)}
        </PageContainer>
      )}
    </LibraryItemPageState>
  );
}
