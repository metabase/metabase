import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { getStoreUrl } from "metabase/selectors/settings";
import { Text } from "metabase/ui";

import { UpsellBanner } from "./components";

type LOCATION = "embedding-page" | "settings-general";

export function UpsellDevInstances({ location }: { location: LOCATION }) {
  const isDevMode = useSetting("development-mode?");

  if (isDevMode) {
    return null;
  }

  return (
    <UpsellBanner
      title={t`Get a development instance`}
      campaign="dev_instances"
      buttonText={t`Set up`}
      buttonLink={getStoreUrl("account/new-dev-instance")}
      location={location}
      dismissible
    >
      <Text size="sm">
        {t`Test out code in staging in a separate Metabase instance before deploying to production.`}
      </Text>
    </UpsellBanner>
  );
}
