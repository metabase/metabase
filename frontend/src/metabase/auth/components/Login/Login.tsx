import { t } from "ttag";
import { Location } from "history";
import { Box } from "metabase/ui";
import { useSelector } from "metabase/lib/redux";
import { AuthProvider } from "metabase/plugins/types";
import { AuthLayout } from "../AuthLayout";
import { getAuthProviders } from "../../selectors";

interface LoginQueryString {
  redirect?: string;
}

interface LoginQueryParams {
  provider?: string;
}

interface LoginProps {
  params?: LoginQueryParams;
  location?: Location<LoginQueryString>;
}

export const Login = ({ params, location }: LoginProps): JSX.Element => {
  const providers = useSelector(getAuthProviders);
  const selection = getSelectedProvider(providers, params?.provider);
  const redirectUrl = location?.query?.redirect;

  return (
    <AuthLayout>
      <Box c="text.2" fz="1.25rem" fw="bold" lh="1.5rem" ta="center">
        {t`Sign in to Metabase`}
      </Box>
      {selection && selection.Panel && (
        <Box mt="2.5rem">
          <selection.Panel redirectUrl={redirectUrl} />
        </Box>
      )}
      {!selection && (
        <Box mt="3.5rem">
          {providers.map(provider => (
            <Box key={provider.name} mt="2rem" ta="center">
              <provider.Button isCard={true} redirectUrl={redirectUrl} />
            </Box>
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
      ? providers.find(p => p.name === providerName)
      : providers[0];

  return provider?.Panel ? provider : undefined;
};
