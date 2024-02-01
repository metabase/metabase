import { memo, useEffect } from "react";
import { refreshCurrentUser } from "metabase/redux/user";
import { reloadSettings } from "metabase/admin/settings/settings";
import registerVisualizations from "metabase/visualizations/register";
import { useDispatch } from "metabase/lib/redux";
import api from "metabase/lib/api";

interface InitDataLoaderProps {
  apiKey: string;
  apiUrl: string;
  onInitialize: () => void;
  onLogin: (isLoggedIn: boolean) => void;
}

const InitDataLoaderInternal = ({
  apiKey,
  apiUrl,
  onInitialize,
  onLogin,
}: InitDataLoaderProps): JSX.Element | null => {
  const dispatch = useDispatch();

  useEffect(() => {
    registerVisualizations();
  }, []);

  useEffect(() => {
    if (apiKey && apiUrl) {
      api.basename = apiUrl;
      api.apiKey = apiKey;

      Promise.all([
        dispatch(refreshCurrentUser()),
        dispatch(reloadSettings()),
      ]).then(() => {
        onInitialize();
        onLogin(true);
      });
    } else {
      onLogin(false);
    }
  }, [apiKey, apiUrl, dispatch, onInitialize, onLogin]);

  return null;
};

export const InitDataLoader = memo(InitDataLoaderInternal);
