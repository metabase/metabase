import { useLayoutEffect } from "react";
import { replace } from "react-router-redux";

import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";

const FALLBACK_PATH = "/admin/metabot/";

/** Redirects Metabot admin sub-pages to the index until AI is configured. */
export const RequireMetabotConfigured = ({
  children,
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
