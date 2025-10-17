import type React from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Box } from "metabase/ui";

import { NotFound } from "../ErrorPages";

import S from "./AdminSettingsLayout.module.css";

export const AdminSettingsLayout = ({
  sidebar,
  children,
  fullWidth = false,
  maw = "50rem",
}: {
  sidebar?: React.ReactNode;
  children?: React.ReactNode;
  fullWidth?: boolean;
  maw?: string;
}) => {
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
          data-testid="admin-layout-content"
          p={fullWidth ? 0 : "2rem"}
        >
          <Box maw={fullWidth ? undefined : maw} w="100%">
            <Box {...(fullWidth ? { h: "100%" } : { pb: "2rem" })}>
              <ErrorBoundary>{children ?? <NotFound />}</ErrorBoundary>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
