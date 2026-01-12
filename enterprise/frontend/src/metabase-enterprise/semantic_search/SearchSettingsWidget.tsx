import { useEffect, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { BasicAdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { UpsellSemanticSearchPill } from "metabase/admin/upsells/UpsellSemanticSearch";
import { getErrorMessage, useAdminSetting } from "metabase/api/utils";
import { getPlan, isProPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Box, Progress, Stack, Text, Tooltip } from "metabase/ui";
import { useGetSemanticSearchStatusQuery } from "metabase-enterprise/api/search";

function useLatch(bool: boolean) {
  const [hasSeenTrue, setHasSeenTrue] = useState(bool);

  useEffect(() => {
    if (bool && !hasSeenTrue) {
      setHasSeenTrue(true);
    }
  }, [hasSeenTrue, bool]);

  return hasSeenTrue;
}

export function SearchSettingsWidget({
  statusPollingInterval = 5000,
}: {
  statusPollingInterval?: number;
}) {
  const plan = useSelector((state) =>
    getPlan(getSetting(state, "token-features")),
  );
  const shouldUpsell = !isProPlan(plan);

  const { value } = useAdminSetting("search-engine");
  const semanticSearchEnabled = value === "semantic";

  const [hasFinishedIndexing, setHasFinishedIndexing] = useState(false);
  const response = useGetSemanticSearchStatusQuery(undefined, {
    pollingInterval: statusPollingInterval,
    skip: !semanticSearchEnabled || hasFinishedIndexing,
  });
  const { indexed_count = 0, total_est = 1 } = response.data || {};

  // total records is an estimate, assume we're done a bit early
  // to avoid showing status when we shouldn't
  const estimatedPercentComplete = Math.round(
    (indexed_count / total_est) * 100,
  );
  const progress =
    estimatedPercentComplete >= 95 ? 100 : estimatedPercentComplete;

  useEffect(() => {
    if (progress === 100) {
      setHasFinishedIndexing(true);
    }
  }, [progress]);

  const isIndexing = useLatch(response.data !== undefined && progress !== 100);

  return (
    <Stack data-testid="search-engine-setting">
      <Stack gap="0">
        <SettingHeader
          id="search-engine"
          title={t`Advanced semantic search`}
          description={t`Provides more relevant search results.`}
        />

        {shouldUpsell && (
          <div>
            <UpsellSemanticSearchPill source="settings-general" />
          </div>
        )}
      </Stack>

      {!shouldUpsell && (
        <>
          <Box>
            <Tooltip label={t`Contact support to change this setting.`}>
              <Box display="inline-flex">
                <BasicAdminSettingInput
                  name="search-engine"
                  inputType="boolean"
                  value={semanticSearchEnabled}
                  disabled
                  onChange={_.noop}
                />
              </Box>
            </Tooltip>
          </Box>

          {response.error && (
            <Text c="error">
              {getErrorMessage(
                response,
                t`Unable to fetch health status of search index.`,
              )}
            </Text>
          )}

          {!response.error && isIndexing && (
            <Stack gap="xs">
              <Progress
                size="md"
                value={progress}
                maw="25rem"
                animated={progress < 100}
              />
              <Text c="text-tertiary" size="md">
                {progress === 100
                  ? t`Initialized search index`
                  : t`Initializing search index...`}
              </Text>
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
