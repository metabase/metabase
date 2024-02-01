import { useAsyncFn } from "react-use";
import { t } from "ttag";

import type { TUseLLMDashboardDescription } from "metabase/plugins/types";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Button, Group } from "metabase/ui";
import { GET } from "metabase/lib/api";

import "./loading.css";

const getSummarizeDashboard = GET(
  "/api/ee/autodescribe/dashboard/summarize/:dashboardId",
);

export const useLLMDashboardDescription: TUseLLMDashboardDescription = ({
  dashboardId,
}) => {
  const hasOpenAIKey = Boolean(
    useSelector(state => getSetting(state, "ee-openai-api-key")),
  );

  const [{ loading, value: generatedDescription }, fetchSuggestion] =
    useAsyncFn(async () => {
      if (!hasOpenAIKey) {
        return "";
      }

      const response = await getSummarizeDashboard({
        dashboardId,
      });
      return response?.summary?.description;
    }, [dashboardId]);

  return {
    generatedDescription,
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
