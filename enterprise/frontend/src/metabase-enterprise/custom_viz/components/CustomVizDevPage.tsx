import { useMemo } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useListAllCustomVizPluginsQuery } from "metabase-enterprise/api";

import { AddDevCustomVizForm } from "./AddDevCustomVizForm";
import { EditDevCustomVizForm } from "./EditDevCustomVizForm";

export function CustomVizDevPage() {
  const { data: plugins, error, isLoading } = useListAllCustomVizPluginsQuery();

  const devPlugin = useMemo(
    () => plugins?.find((plugin) => plugin.dev_only),
    [plugins],
  );

  return (
    <SettingsPageWrapper
      title={t`Development`}
      description={t`Set a dev server URL to load plugin code from a local dev server instead of the git repository. Changes take effect on the next page reload.`}
    >
      <LoadingAndErrorWrapper error={error} loading={isLoading} />

      {devPlugin ? (
        <EditDevCustomVizForm plugin={devPlugin} />
      ) : (
        <AddDevCustomVizForm />
      )}
    </SettingsPageWrapper>
  );
}
