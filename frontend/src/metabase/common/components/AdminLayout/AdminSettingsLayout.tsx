import type React from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_METABOT } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import { Box } from "metabase/ui";

import { NotFound } from "../ErrorPages";

import S from "./AdminSettingsLayout.module.css";

export const AdminSettingsLayout = ({
  sidebar,
  children,
  fullWidthContent = false,
  maw = fullWidthContent ? "100%" : "50rem",
  padding = fullWidthContent ? "0" : "2rem",
}: {
  sidebar?: React.ReactNode;
  children?: React.ReactNode;
  fullWidthContent?: boolean;
  maw?: string;
  padding?: string;
}) => {
  const location = useSelector(getLocation);
  const isMetabotEnabledForRoute =
    location.pathname.startsWith("/admin/transforms");

  return (
    <Box className={S.Wrapper}>
      <Box className={S.Main}>
        {sidebar && (
          <Box className={S.Sidebar} data-testid="admin-layout-sidebar">
            {sidebar}
          </Box>
        )}
        <Box
          className={S.Content}
          style={{ padding }}
          data-testid="admin-layout-content"
        >
          <Box maw={maw} w="100%">
            <Box {...(fullWidthContent ? { h: "100%" } : { pb: "2rem" })}>
              <ErrorBoundary>{children ?? <NotFound />}</ErrorBoundary>
            </Box>
          </Box>
        </Box>

        <PLUGIN_METABOT.Metabot hide={!isMetabotEnabledForRoute} />
      </Box>
    </Box>
  );
};
