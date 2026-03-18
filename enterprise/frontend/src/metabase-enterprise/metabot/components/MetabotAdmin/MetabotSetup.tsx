import { useEffect } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";

import { MetabotNavPane } from "./MetabotNavPane";
import { MetabotProviderSection } from "./MetabotProviderSection";

export function MetabotSetup() {
  const dispatch = useDispatch();
  const isHosted = useSetting("is-hosted?");

  useEffect(() => {
    if (isHosted) {
      dispatch(push("/admin/metabot/"));
    }
  }, [dispatch, isHosted]);

  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <SettingsSection
        title="Connect to AI Provider"
        description={t`Select your AI provider and configure your API key to get started with Metabot.`}
      >
        <MetabotProviderSection />
      </SettingsSection>
    </AdminSettingsLayout>
  );
}
