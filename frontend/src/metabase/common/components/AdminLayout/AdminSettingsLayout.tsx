import type React from "react";
import { useEffect, useRef } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useRouter } from "metabase/router/useRouter";
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
  const contentRef = useRef<HTMLDivElement>(null);
  useScrollToTop(contentRef);

  return (
    <Box className={S.Wrapper}>
      <Box className={S.Main}>
        {sidebar && (
          <Box className={S.Sidebar} data-testid="admin-layout-sidebar">
            {sidebar}
          </Box>
        )}
        <Box
          ref={contentRef}
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

const useScrollToTop = (contentRef: React.RefObject<HTMLDivElement | null>) => {
  const { location } = useRouter();

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [location?.pathname, contentRef]);
};
