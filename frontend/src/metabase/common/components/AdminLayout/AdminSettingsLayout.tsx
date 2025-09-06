import type React from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Box } from "metabase/ui";

import { NotFound } from "../ErrorPages";

import S from "./AdminSettingsLayout.module.css";

export const AdminSettingsLayout = ({
  sidebar,
  children,
  maw = "50rem",
  rightSidebar,
}: {
  sidebar?: React.ReactNode;
  children?: React.ReactNode;
  maw?: string;
  rightSidebar?: React.ReactNode;
}) => {
  return (
    <Box className={S.Wrapper}>
      <Box className={S.MainWithRightSidebar}>
        <Box className={S.Main}>
          {sidebar && (
            <Box className={S.Sidebar} data-testid="admin-layout-sidebar">
              {sidebar}
            </Box>
          )}
          <Box className={S.Content} data-testid="admin-layout-content">
            <Box maw={maw} w="100%">
              <Box pb="2rem">
                <ErrorBoundary>{children ?? <NotFound />}</ErrorBoundary>
              </Box>
            </Box>
          </Box>
        </Box>
        {rightSidebar && (
          <Box
            className={S.RightSidebar}
            data-testid="admin-layout-right-sidebar"
          >
            {rightSidebar}
          </Box>
        )}
      </Box>
    </Box>
  );
};
