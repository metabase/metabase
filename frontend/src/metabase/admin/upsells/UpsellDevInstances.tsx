import { t } from "ttag";

import { useSetting, useStoreUrl } from "metabase/common/hooks";
import { Text } from "metabase/ui";

import { UpsellBanner } from "./components";

type LOCATION = "embedding-page" | "settings-general";

export function UpsellDevInstances({ location }: { location: LOCATION }) {
  const isDevMode = useSetting("development-mode?");
  const storeUrl = useStoreUrl("account/new-dev-instance");
  const campaign = "dev_instances";

  if (isDevMode || storeUrl === undefined) {
    return null;
  }

  return (
    <UpsellBanner
      title={t`Get a development instance`}
      campaign={campaign}
      buttonText={t`Set up`}
      buttonLink={storeUrl}
      location={location}
      dismissible
    >
      <Text c="text-secondary" lh="md">
        {t`Test out code in staging in a separate Metabase instance before deploying to production.`}
      </Text>
    </UpsellBanner>
  );
}
