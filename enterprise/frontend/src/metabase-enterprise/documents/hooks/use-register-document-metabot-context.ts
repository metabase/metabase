import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { getLocation } from "metabase/selectors/routing";

export const useRegisterDocumentMetabotContext = (body: string) => {
  useRegisterMetabotContextProvider(
    async (state) => {
      const location = getLocation(state);

      const doc = { type: "document", body };

      // Extract document ID from URL path like "/document/123"
      const documentMatch = location.pathname.match(/^\/document\/(\d+)/);
      if (documentMatch) {
        doc.id = parseInt(documentMatch?.[1] ?? "0", 10);
      }

      return {
        user_is_viewing: [doc],
      };
    },
    [body],
  );
};
