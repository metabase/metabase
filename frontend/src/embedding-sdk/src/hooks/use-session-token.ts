import { useCallback, useEffect, useState } from "react";
import { refreshTokenAsync } from "metabase/public/reducers";
import type { SDKConfigType } from "../config";
import type { useDispatch } from "metabase/lib/redux";

export const useSessionToken = ({
  jwtProviderUri,
  dispatch,
}: {
  jwtProviderUri: SDKConfigType["jwtProviderUri"];
  dispatch: ReturnType<typeof useDispatch>;
}) => {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [tokenExp, setTokenExp] = useState<string | null>(null);

  useEffect(() => {
    dispatch(refreshTokenAsync());
  }, [dispatch]);

  const fetchSessionToken = useCallback(async () => {
    if (!jwtProviderUri) {
      return;
    }

    fetch(jwtProviderUri, {
      method: "GET",
      credentials: "include",
    })
      .then(response => response.json())
      .then(response => {
        setSessionToken(response.id);
        setTokenExp(response.exp);

        const delay = Number(response.exp) * 1000 - Date.now() - 60000;

        if (delay > 0) {
          setTimeout(() => {
            fetchSessionToken();
          }, delay);
        }
      })
      .catch(error => console.error("Failed to fetch session token:", error));
  }, [jwtProviderUri, setSessionToken, setTokenExp]);

  useEffect(() => {
    fetchSessionToken();
    // eslint-disable-next-line
  }, []);

  const resetSessionToken = () => {
    console.log("resetting session token");
    setSessionToken(null);
    setTokenExp(null);
  };

  return {
    sessionToken,
    tokenExp,
    resetSessionToken,
  };
};
