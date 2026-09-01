import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { useLocation } from "metabase/router";

export const useRegisterDocumentMetabotContext = () => {
  const { pathname } = useLocation();

  useRegisterMetabotContextProvider(async () => {
    // Extract document ID from URL path like "/document/123"
    const documentMatch = pathname.match(/^\/document\/(\d+)/);
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
  }, [pathname]);
};
