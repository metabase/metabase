import { useEffect } from "react";
import { refreshTokenAsync } from "metabase/public/reducers";
import type { useDispatch } from "metabase/lib/redux";
import type { SDKConfigType } from "../config";

export const useSessionToken = ({
  jwtProviderUri,
  dispatch,
}: {
  jwtProviderUri: SDKConfigType["jwtProviderUri"];
  dispatch: ReturnType<typeof useDispatch>;
}) => {
  useEffect(() => {
    if (jwtProviderUri) {
      dispatch(refreshTokenAsync(jwtProviderUri));
    }
  }, [dispatch, jwtProviderUri]);

  return {};
};
