import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { usePageTitle } from "metabase/hooks/use-page-title";
import type { AuthProvider } from "metabase/plugins/types";
import { useSelector } from "metabase/redux";
import { prefetchPage, useParams, useSearchParams } from "metabase/router";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Divider } from "metabase/ui";

import { getAuthProviders } from "../../selectors";
import { AuthLayout } from "../AuthLayout";

type LoginQueryParams = {
  provider: string;
};

export const Login = (): JSX.Element => {
  const [searchParams] = useSearchParams();
  const params = useParams<LoginQueryParams>();
  const providers = useSelector(getAuthProviders);
  const selection = getSelectedProvider(providers, params.provider);
  const redirectUrl = searchParams.get("redirect") ?? undefined;
  const applicationName = useSelector(getApplicationName);

  usePageTitle(t`Login`);

  // Signing in lands on the home page, which is a chunk of its own. Ask for it
  // while the user types, so it is there when they arrive. A login that carries
  // a redirect goes somewhere else, and that page loads on its own terms.
  useMount(() => {
    if (!redirectUrl) {
      prefetchPage("/");
    }
  });

  const [passwordProvider, otherProviders] = _.partition(
    providers,
    (provider) => provider.name === "password",
  );
  return (
    <AuthLayout>
      <Box
        role="heading"
        c="text-primary"
        fz="1.25rem"
        fw="bold"
        lh="1.5rem"
        ta="center"
      >
        {t`Sign in to ${applicationName}`}
      </Box>
      {selection && selection.Panel && (
        <Box mt="2.5rem">
          <selection.Panel redirectUrl={redirectUrl} />
        </Box>
      )}
      {!selection && (
        <Box mt="3.5rem">
          {otherProviders.map((provider) => (
            <Box key={provider.name} mt="2rem" ta="center">
              <provider.Button isCard={true} redirectUrl={redirectUrl} />
            </Box>
          ))}
          {passwordProvider.map((provider) => (
            <>
              <Divider mt="2rem" />
              <Box key={provider.name} mt="1rem" ta="center">
                <provider.Button isCard={true} redirectUrl={redirectUrl} />
              </Box>
            </>
          ))}
        </Box>
      )}
    </AuthLayout>
  );
};

const getSelectedProvider = (
  providers: AuthProvider[],
  providerName?: string,
): AuthProvider | undefined => {
  const provider =
    providers.length > 1
      ? providers.find((p) => p.name === providerName)
      : providers[0];

  return provider?.Panel ? provider : undefined;
};
