import { getIn } from "icepick";
import { useCallback, useState } from "react";
import { t } from "ttag";

import Link from "metabase/common/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Button, Checkbox } from "metabase/ui";

import { loginSSO } from "../../actions";
import { getSSOConfig } from "../../selectors";

interface SSOButtonProps {
  redirectUrl?: string;
  isCard?: boolean;
}

export const SSOButton = ({ redirectUrl, isCard }: SSOButtonProps) => {
  const [remember, setRemember] = useState(false);
  const ssoConfig = useSelector(getSSOConfig);
  const [errors, setErrors] = useState<string[]>([]);
  const dispatch = useDispatch();

  const handleLogin = useCallback(async () => {
    try {
      setErrors([]);
      await dispatch(
        loginSSO({ redirectUrl, remember }),
      ).unwrap();
    } catch (error) {
      setErrors(getErrors(error));
    }
  }, [dispatch, redirectUrl, remember]);

  const providerName = ssoConfig?.provider || "SSO";
  const displayName = {
    google: "Google",
    okta: "Okta", 
    auth0: "Auth0",
    custom: "SSO"
  }[providerName] || providerName;

  if (!ssoConfig?.enabled) {
    return null;
  }

  return (
    <Box>
      {isCard ? (
        <Box>
          <Button
            fullWidth
            variant="outline"
            onClick={handleLogin}
            styles={{
              root: {
                border: "1px solid #dadce0",
                color: "#3c4043",
                "&:hover": {
                  backgroundColor: "#f8f9fa",
                },
              },
            }}
          >
            {t`Sign in with ${displayName}`}
          </Button>
          <Checkbox
            mt="1rem"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            label={t`Remember me`}
          />
        </Box>
      ) : (
        <Link to={Urls.login(redirectUrl)}>
          {t`Sign in with ${displayName}`}
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