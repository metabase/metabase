import { getTrashDocumentMessage } from "metabase/documents/utils/trash";

import { LibrarySectionPage } from "../../../components/LibrarySectionPage";
import { CreateLibraryDocumentModal } from "../../components/CreateLibraryDocumentModal";

export function DocumentsPage() {
  return (
    <LibrarySectionPage
      model="document"
      CreateModal={CreateLibraryDocumentModal}
      getTrashMessage={getTrashDocumentMessage}
    />
  );
}
