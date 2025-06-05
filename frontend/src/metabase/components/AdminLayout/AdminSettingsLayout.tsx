import type React from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Box } from "metabase/ui";

import { NotFound } from "../ErrorPages";

import S from "./AdminSettingsLayout.module.css";

export const AdminSettingsLayout = ({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children?: React.ReactNode;
}) => {
  return (
    <Box className={S.Wrapper}>
      <Box className={S.Main}>
        <Box className={S.Sidebar} data-testid="admin-layout-sidebar">
          {sidebar}
        </Box>
        <Box className={S.Content} data-testid="admin-layout-content">
          <Box>
            <ErrorBoundary>{children ?? <NotFound />}</ErrorBoundary>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
