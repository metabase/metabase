import { jt, t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useSetting } from "metabase/common/hooks";
import { Alert, Icon, Text } from "metabase/ui";

const MANAGE_INSTANCE_URL = "https://metabase.com/";
const GET_TOKEN_URL = "https://metabase.com/";

export function DevInstanceBanner() {
  const isDevMode = useSetting("development-mode?");
  const isHosted = useSetting("is-hosted?");

  if (!isDevMode) {
    return null;
  }

  return (
    <Alert icon={<Icon name="info_filled" />}>
      {isHosted && (
        <Text lh="1.25rem">{jt`This instance is in development mode and can be used for development or testing purposes only.
        ${(<ExternalLink style={{ fontWeight: "bold" }} href={MANAGE_INSTANCE_URL}>{t`Manage instance`}</ExternalLink>)}`}</Text>
      )}
      {!isHosted && (
        <Text lh="1.25rem">{jt`This instance is in development mode and can be used for development or testing purposes only. To spin up more development instances, use your development license token.
        ${(<ExternalLink style={{ fontWeight: "bold" }} href={GET_TOKEN_URL}>{t`Get your token`}</ExternalLink>)}`}</Text>
      )}
    </Alert>
  );
}
