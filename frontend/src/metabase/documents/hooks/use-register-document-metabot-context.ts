import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { getLocation } from "metabase/selectors/routing";

export const useRegisterDocumentMetabotContext = () => {
  useRegisterMetabotContextProvider(async (state) => {
    const location = getLocation(state);

    // Extract document ID from URL path like "/document/123"
    const documentMatch = location.pathname.match(/^\/document\/(\d+)/);
    if (!documentMatch) {
      return {};
    }

    const documentId = parseInt(documentMatch[1], 10);

    return {
      user_is_viewing: [
        {
          type: "document",
          id: documentId,
        },
      ],
    };
  }, []);
};
