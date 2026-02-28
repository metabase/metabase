import { getCurrentLocation } from "metabase/lib/router";
import { useRegisterMetabotContextProvider } from "metabase/metabot";

export const useRegisterDocumentMetabotContext = () => {
  useRegisterMetabotContextProvider(async () => {
    // Extract document ID from URL path like "/document/123"
    const documentMatch =
      getCurrentLocation().pathname.match(/^\/document\/(\d+)/);
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
