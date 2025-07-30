import { t } from "ttag";

import { UpsellSemanticSearchPill } from "metabase/admin/upsells/UpsellSemanticSearch";
import { useAdminSetting } from "metabase/api/utils";
import { useHasTokenFeature } from "metabase/common/hooks";
import { getPlan, isProPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getIsHosted } from "metabase/setup";
import { Stack } from "metabase/ui";

import { SettingHeader } from "../SettingHeader";
import { BasicAdminSettingInput } from "../widgets/AdminSettingInput";

export function SearchSettingsWidget() {
  const hasFeature = useHasTokenFeature("semantic_search");
  const isHosted = useSelector(getIsHosted);
  const plan = useSelector((state) =>
    getPlan(getSetting(state, "token-features")),
  );
  const shouldUpsell = !hasFeature && !isProPlan(plan);

  const { value, updateSetting } = useAdminSetting("search-engine");

  const handleChange = async (enabled: boolean) => {
    await updateSetting({
      key: "search-engine",
      // null will pick the appropriate default for the app-db
      value: enabled ? "semantic" : null,
    });
  };

  const isPartOfLimitedRollout = hasFeature && isHosted;
  if (!isPartOfLimitedRollout) {
    return null;
  }

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
        <BasicAdminSettingInput
          name="search-engine"
          inputType="boolean"
          value={value === "semantic"}
          onChange={(newValue) => handleChange(Boolean(newValue))}
        />
      )}
    </Stack>
  );
}
