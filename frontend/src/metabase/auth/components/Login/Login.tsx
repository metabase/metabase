import { t } from "ttag";
import { Location } from "history";
import { useSelector } from "metabase/lib/redux";
import { AuthProvider } from "metabase/plugins/types";
import { AuthLayout } from "../AuthLayout";
import { getAuthProviders } from "../../selectors";
import { useStyles } from "./Login.styles";

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
  const { classes } = useStyles();
  const providers = useSelector(getAuthProviders);
  const selection = getSelectedProvider(providers, params?.provider);
  const redirectUrl = location?.query?.redirect;

  return (
    <AuthLayout>
      <div className={classes.title}>{t`Sign in to Metabase`}</div>
      {selection && selection.Panel && (
        <div className={classes.panel}>
          <selection.Panel redirectUrl={redirectUrl} />
        </div>
      )}
      {!selection && (
        <div className={classes.actionList}>
          {providers.map(provider => (
            <div key={provider.name} className={classes.actionListItem}>
              <provider.Button isCard={true} redirectUrl={redirectUrl} />
            </div>
          ))}
        </div>
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
