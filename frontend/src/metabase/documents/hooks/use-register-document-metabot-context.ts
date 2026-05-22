import { getCurrentDocument } from "metabase/documents/selectors";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";

export const useRegisterDocumentMetabotContext = () => {
  const currentLocation = useSelector(getLocation);
  const currentDocument = useSelector(getCurrentDocument);
  const currentDocumentName = currentDocument?.name;
  const currentPathname = currentLocation.pathname;

  useRegisterMetabotContextProvider(async () => {
    // Extract document ID from URL path like "/document/123"
    const documentMatch = currentPathname.match(/^\/document\/(\d+)/);
    if (!documentMatch) {
      return {};
    }

    const documentId = parseInt(documentMatch[1], 10);

    return {
      user_is_viewing: [
        {
          type: "document",
          id: documentId,
          name: currentDocumentName,
        },
      ],
    };
  }, [currentDocumentName, currentPathname]);
};
