import { useRegisterMetabotContextProvider } from "metabase/metabot";

export const useRegisterDocumentMetabotContext = () => {
  useRegisterMetabotContextProvider(async () => {
    // Extract document ID from URL path like "/document/123"
    const documentMatch = window.location.pathname.match(/^\/document\/(\d+)/);
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
