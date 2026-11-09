import { t } from "ttag";

import { useSetting } from "metabase/settings";
import { Box, Button, Group } from "metabase/ui";
import * as Urls from "metabase/urls";

/** A button per enabled OIDC provider to link the current user's identity there to their account. */
export function OidcAccountLinkingPanel() {
  const providers = useSetting("oidc-login-providers") ?? [];
  const params = new URLSearchParams({
    link: "true",
    redirect: Urls.accountAuthentication(),
  });

  return (
    <>
      {providers.map((provider) => (
        <Group key={provider.key} justify="space-between" wrap="nowrap">
          <Box fw="bold">{provider["login-prompt"]}</Box>
          <Button component="a" href={`${provider["sso-url"]}?${params}`}>
            {t`Link account`}
          </Button>
        </Group>
      ))}
    </>
  );
}
