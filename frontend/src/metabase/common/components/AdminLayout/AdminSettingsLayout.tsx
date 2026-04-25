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
  shouldScrollToTopOnPathChange,
}: {
  sidebar?: React.ReactNode;
  children?: React.ReactNode;
  fullWidth?: boolean;
  maw?: string;
  shouldScrollToTopOnPathChange?: (
    previousPathname: string | undefined,
    nextPathname: string | undefined,
  ) => boolean;
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  useScrollToTop(contentRef, shouldScrollToTopOnPathChange);

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

const useScrollToTop = (
  contentRef: React.RefObject<HTMLDivElement | null>,
  shouldScrollToTopOnPathChange: (
    previousPathname: string | undefined,
    nextPathname: string | undefined,
  ) => boolean = () => true,
) => {
  const { location } = useRouter();
  const previousPathnameRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    const nextPathname = location?.pathname;
    const hasPathChanged = previousPathname !== nextPathname;

    if (
      previousPathname === undefined ||
      (hasPathChanged &&
        shouldScrollToTopOnPathChange(previousPathname, nextPathname))
    ) {
      contentRef.current?.scrollTo(0, 0);
    }

    previousPathnameRef.current = nextPathname;
  }, [location?.pathname, contentRef, shouldScrollToTopOnPathChange]);
};
