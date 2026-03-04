import { useDebouncedValue, useResizeObserver } from "@mantine/hooks";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { getIn } from "icepick";
import { useCallback, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Link } from "metabase/common/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Checkbox, useColorScheme } from "metabase/ui";

import { loginGoogle } from "../../actions";
import { getGoogleClientId, getSiteLocale } from "../../selectors";

import S from "./GoogleButton.module.css";

interface GoogleButtonProps {
  redirectUrl?: string;
  isCard?: boolean;
}

interface CredentialResponse {
  credential?: string;
}

export const GoogleButton = ({ redirectUrl, isCard }: GoogleButtonProps) => {
  const [remember, setRemember] = useState(false);
  const clientId = useSelector(getGoogleClientId);
  const locale = useSelector(getSiteLocale);
  const [errors, setErrors] = useState<string[]>([]);
  const dispatch = useDispatch();

  const { resolvedColorScheme } = useColorScheme();

  const handleLogin = useCallback(
    async ({ credential = "" }: CredentialResponse) => {
      try {
        setErrors([]);
        await dispatch(
          loginGoogle({ credential, redirectUrl, remember }),
        ).unwrap();
      } catch (error) {
        setErrors(getErrors(error));
      }
    },
    [dispatch, redirectUrl, remember],
  );

  const handleError = useCallback(() => {
    setErrors([
      t`There was an issue signing in with Google. Please contact an administrator.`,
    ]);
  }, []);

  const [buttonContainer, rect] = useResizeObserver();

  const [width] = useDebouncedValue(rect.width, 200);

  return (
    <Box ref={buttonContainer}>
      {isCard && clientId ? (
        <ErrorBoundary>
          <GoogleOAuthProvider clientId={clientId} nonce={window.MetabaseNonce}>
            <GoogleLogin
              useOneTap
              onSuccess={handleLogin}
              onError={handleError}
              locale={locale}
              width={width}
              theme={
                resolvedColorScheme === "dark" ? "filled_black" : "outline"
              }
              // This is needed to ensure that no white border shows up around the
              // login button in dark mode (UXW-2138)
              containerProps={{
                style: { colorScheme: "light" },
              }}
            />
          </GoogleOAuthProvider>
          <Checkbox
            mt="1rem"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            label={t`Remember me`}
          />
        </ErrorBoundary>
      ) : (
        <Link className={S.Link} to={Urls.login(redirectUrl)}>
          {t`Sign in with Google`}
        </Link>
      )}

      {errors.length > 0 && (
        <Box mt="1rem">
          {errors.map((error, index) => (
            <Box c="error" ta="center" key={index}>
              {error}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

const getErrors = (error: unknown): string[] => {
  const errors = getIn(error, ["data", "errors"]);
  return errors ? Object.values(errors) : [];
};
