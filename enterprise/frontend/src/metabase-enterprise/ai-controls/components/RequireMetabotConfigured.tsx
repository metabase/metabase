import { useLayoutEffect } from "react";

import { Outlet, useNavigate } from "metabase/router";
import { useSetting } from "metabase/settings";

const FALLBACK_PATH = "/admin/metabot/";

function RequireEnabled({
  isEnabled,
  children = <Outlet />,
}: {
  isEnabled: boolean;
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();

  useLayoutEffect(() => {
    if (!isEnabled) {
      navigate(FALLBACK_PATH, { replace: true });
    }
  }, [isEnabled, navigate]);

  if (!isEnabled) {
    return null;
  }

  return <>{children}</>;
}

export const RequireMetabotConfigured = ({
  children,
}: {
  children?: React.ReactNode;
}) => {
  const isConfigured = useSetting("llm-metabot-configured?");
  return <RequireEnabled isEnabled={!!isConfigured}>{children}</RequireEnabled>;
};

export const RequireMcpEnabled = ({
  children,
}: {
  children?: React.ReactNode;
}) => {
  const isMcpEnabled = useSetting("mcp-enabled?");
  return <RequireEnabled isEnabled={isMcpEnabled}>{children}</RequireEnabled>;
};
