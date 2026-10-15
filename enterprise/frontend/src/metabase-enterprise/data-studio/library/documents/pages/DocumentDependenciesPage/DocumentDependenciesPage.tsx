import { LibraryItemDependencies } from "../../../components/LibraryItemDependencies";
import { DocumentPageShell } from "../../components/DocumentPageShell";

export function DocumentDependenciesPage() {
  return (
    <DocumentPageShell data-testid="document-dependencies-page">
      {(document) => (
        <LibraryItemDependencies model="document" item={document} />
      )}
    </DocumentPageShell>
  );
}
