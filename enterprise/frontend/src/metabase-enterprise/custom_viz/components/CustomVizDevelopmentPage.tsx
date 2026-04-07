import { useMemo } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useListAllCustomVizPluginsQuery } from "metabase/api";
import { Flex, Loader } from "metabase/ui";

import { AddDevPluginForm } from "./AddDevPluginForm";
import { EditDevPluginForm } from "./EditDevPluginForm";

export function CustomVizDevelopmentPage() {
  const { data: plugins, isLoading } = useListAllCustomVizPluginsQuery();

  const devPlugin = useMemo(() => plugins?.find((p) => p.dev_only), [plugins]);

  return (
    <SettingsPageWrapper
      title={t`Development`}
      description={t`Set a dev bundle URL to load plugin code from a local dev server instead of the stored bundle. Changes take effect on the next page reload.`}
    >
      {isLoading && (
        <Flex justify="center" p="xl">
          <Loader />
        </Flex>
      )}

      {devPlugin ? (
        <EditDevPluginForm plugin={devPlugin} />
      ) : (
        <AddDevPluginForm />
      )}
    </SettingsPageWrapper>
  );
}
