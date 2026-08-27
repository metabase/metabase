import { useLayoutEffect } from "react";

import { Outlet, useNavigate } from "metabase/router";
import { useSetting } from "metabase/settings";

const FALLBACK_PATH = "/admin/metabot/";

/** Redirects Metabot admin sub-pages to the index until AI is configured. */
export const RequireMetabotConfigured = ({
  children = <Outlet />,
}: {
  children?: React.ReactNode;
}) => {
  const isConfigured = useSetting("llm-metabot-configured?");
  const navigate = useNavigate();

  useLayoutEffect(() => {
    if (!isConfigured) {
      navigate(FALLBACK_PATH, { replace: true });
    }
  }, [isConfigured, navigate]);

  if (!isConfigured) {
    return null;
  }

  return <>{children}</>;
};
