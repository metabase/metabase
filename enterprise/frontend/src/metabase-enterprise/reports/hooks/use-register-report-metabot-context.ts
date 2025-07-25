import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { getLocation } from "metabase/selectors/routing";

export const useRegisterReportMetabotContext = () => {
  useRegisterMetabotContextProvider(async (state) => {
    const location = getLocation(state);

    // Extract report ID from URL path like "/report/123" or "/report/123?version=2"
    const reportMatch = location.pathname.match(/^\/report\/(\d+)/);
    if (!reportMatch) {
      return {};
    }

    const reportId = parseInt(reportMatch[1], 10);

    return {
      user_is_viewing: [
        {
          type: "report",
          id: reportId,
        },
      ],
    };
  }, []);
};
