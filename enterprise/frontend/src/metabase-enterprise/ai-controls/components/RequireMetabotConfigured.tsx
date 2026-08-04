import { useLayoutEffect } from "react";

import { useDispatch } from "metabase/redux";
import { Outlet, replace } from "metabase/router";
import { useSetting } from "metabase/settings";

const FALLBACK_PATH = "/admin/metabot/";

/** Redirects Metabot admin sub-pages to the index until AI is configured. */
export const RequireMetabotConfigured = ({
  children = <Outlet />,
}: {
  children?: React.ReactNode;
}) => {
  const isConfigured = useSetting("llm-metabot-configured?");
  const dispatch = useDispatch();

  useLayoutEffect(() => {
    if (!isConfigured) {
      dispatch(replace(FALLBACK_PATH));
    }
  }, [isConfigured, dispatch]);

  if (!isConfigured) {
    return null;
  }

  return <>{children}</>;
};
