import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Text } from "metabase/ui";

import { UpsellBanner } from "./components";
import { UPGRADE_URL } from "./constants";

type SOURCE = "embedding-page" | "settings-general";

export function UpsellDevInstances({ source }: { source: SOURCE }) {
  const isDevMode = useSetting("development-mode?");

  if (isDevMode) {
    return null;
  }

  return (
    <UpsellBanner
      title={t`Get a development instance`}
      campaign="dev_instances"
      buttonText={t`Set up`}
      buttonLink={UPGRADE_URL}
      source={source}
    >
      <Text size="sm">
        {t`Test out code in staging in a separate Metabase instance before deploying to production.`}
      </Text>
    </UpsellBanner>
  );
}
