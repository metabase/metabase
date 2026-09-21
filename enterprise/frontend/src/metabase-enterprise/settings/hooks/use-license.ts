import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { premiumFeaturesApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { useDispatch } from "metabase/redux";
import { useUpdateSettingMutation } from "metabase/settings";
import { reload } from "metabase/utils/dom";
import type { TokenStatus } from "metabase-types/api";

export const LICENSE_ACCEPTED_URL_HASH = "#activated";

const getInvalidTokenError = () =>
  t`This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.`;

const getUnableToValidateToken = () =>
  // eslint-disable-next-line metabase/no-literal-metabase-strings
  t`We're having trouble validating your token. Please double-check that your instance can connect to Metabase's servers.`;

export const useLicense = (onActivated?: () => void) => {
  const dispatch = useDispatch();
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>();
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();
  const [updateSetting] = useUpdateSettingMutation();

  useEffect(() => {
    if (window.location.hash === LICENSE_ACCEPTED_URL_HASH) {
      history.pushState("", document.title, window.location.pathname);
      onActivated?.();
    }
  }, [onActivated]);

  const updateToken = useCallback(
    async (token: string) => {
      try {
        setError(undefined);
        setIsUpdating(true);
        await updateSetting({
          key: "premium-embedding-token",
          value: token,
        }).unwrap();

        // In order to apply pro and enterprise features we need to perform a full reload
        const isValidTokenAccepted = token.trim().length > 0;
        if (isValidTokenAccepted) {
          window.location.href += LICENSE_ACCEPTED_URL_HASH;
        }
        reload();
      } catch (e) {
        // Unjustified type cast. FIXME
        if ((e as any).status === 503) {
          setError(getUnableToValidateToken());
        } else {
          setError(getInvalidTokenError());
        }
      } finally {
        setIsUpdating(false);
      }
    },
    [updateSetting],
  );

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setTokenStatus(
          await runRtkEndpoint(
            undefined,
            dispatch,
            premiumFeaturesApi.endpoints.getTokenStatus,
          ),
        );
      } catch (e) {
        // Unjustified type cast. FIXME
        if ((e as any).status !== 404) {
          setError(getUnableToValidateToken());
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [dispatch]);

  return {
    isUpdating,
    error,
    tokenStatus,
    loading,
    updateToken,
  };
};
