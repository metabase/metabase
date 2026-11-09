import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Button, Group, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  type OidcIdentity,
  useListOidcIdentitiesQuery,
} from "metabase-enterprise/api";

/**
 * Lists the enabled OIDC providers with a button to link (or relink) the current user's identity at each. Renders
 * nothing when no OIDC provider is enabled.
 */
export function OidcAccountLinkingPanel() {
  const { data: identities, isLoading, error } = useListOidcIdentitiesQuery();

  if (isLoading || error != null || identities == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (identities.length === 0) {
    return null;
  }

  return (
    <Stack gap="lg">
      {identities.map((identity) => (
        <OidcIdentityRow key={identity.key} identity={identity} />
      ))}
    </Stack>
  );
}

function getLinkUrl(ssoUrl: string) {
  const params = new URLSearchParams({
    link: "true",
    redirect: Urls.accountAuthentication(),
  });
  return `${ssoUrl}?${params}`;
}

function OidcIdentityRow({ identity }: { identity: OidcIdentity }) {
  const applicationName = useSelector(getApplicationName);
  const providerName = identity["login-prompt"] ?? identity.key;

  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      <Stack gap="xxs">
        <Box fw="bold">{providerName}</Box>
        <Box c="text-secondary">
          {identity.linked
            ? t`Your account is linked to an identity at this provider.`
            : t`Link your identity at this provider to sign in to ${applicationName} with it.`}
        </Box>
      </Stack>
      <Button component="a" href={getLinkUrl(identity["sso-url"])}>
        {identity.linked ? t`Link a different identity` : t`Link`}
      </Button>
    </Group>
  );
}
