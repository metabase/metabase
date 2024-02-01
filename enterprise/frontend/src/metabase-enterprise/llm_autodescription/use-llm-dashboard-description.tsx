import { useAsyncFn } from "react-use";

import { t } from "ttag";
import type { TUseLLMDashboardDescription } from "metabase/plugins/types";
import { Button, Group } from "metabase/ui";
import { GET } from "metabase/lib/api";

const getSummarizeDashboard = GET(
  "/api/ee/autodescribe/dashboard/summarize/:dashboardId",
);

export const useLLMDashboardDescription: TUseLLMDashboardDescription = ({
  dashboardId,
}) => {
  const [{ loading, value: description }, fetchSuggestion] =
    useAsyncFn(async () => {
      const response = await getSummarizeDashboard({
        dashboardId,
      });

      return response?.summary?.description;
    }, [dashboardId]);

  return {
    description,
    loading,
    SuggestDescriptionButton: () => (
      <Group mt="0.5rem" position="right">
        {!loading ? (
          <Button
            variant="filled"
            onClick={fetchSuggestion}
          >{t`Suggest Description`}</Button>
        ) : (
          <div>
            <span className="suggestionLoading2">✨</span>
            <span className="suggestionLoading">✨</span>
            Generating dashboard description
            <span className="suggestionLoading"> ✨</span>
            <span className="suggestionLoading2">✨</span>
          </div>
        )}
      </Group>
    ),
  };
};
