import { DocumentReadOnlyView } from "metabase/documents/components/DocumentReadOnlyView";
import { Box } from "metabase/ui";

import { OverviewLayout } from "../../../components/OverviewLayout";
import { DocumentPageShell } from "../../components/DocumentPageShell";

import { DocumentInfo } from "./DocumentInfo";

export function DocumentOverviewPage() {
  return (
    <DocumentPageShell data-testid="document-overview-page">
      {(document) => (
        <OverviewLayout
          preview={
            <Box maw={900} mx="auto" px="xl" data-testid="document-preview">
              <DocumentReadOnlyView content={document.document} />
            </Box>
          }
          info={<DocumentInfo document={document} />}
        />
      )}
    </DocumentPageShell>
  );
}
