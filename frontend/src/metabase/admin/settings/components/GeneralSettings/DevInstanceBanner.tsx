import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { getStoreUrl } from "metabase/selectors/settings";
import { Alert, Anchor, Icon, Text } from "metabase/ui";

export function DevInstanceBanner() {
  const isDevMode = useSetting("development-mode?");
  const isHosted = useSetting("is-hosted?");

  if (!isDevMode) {
    return null;
  }

  return (
    <Alert icon={<Icon name="info_filled" />}>
      {isHosted && (
        <BannerBody
          copyText={t`This instance is in development mode and can be used for development or testing purposes only.`}
          linkText={t`Manage instance`}
        />
      )}
      {!isHosted && (
        <BannerBody
          copyText={t`This instance is in development mode and can be used for development or testing purposes only. To spin up more development instances, use your development license token.`}
          linkText={t`Get your token`}
        />
      )}
    </Alert>
  );
}

function BannerBody({
  copyText,
  linkText,
}: {
  linkText: string;
  copyText: string;
}) {
  return (
    <Text lh="1.25rem">
      {copyText}{" "}
      <Anchor fw="bold" href={getStoreUrl()} target="_blank">
        {linkText}
      </Anchor>
    </Text>
  );
}
