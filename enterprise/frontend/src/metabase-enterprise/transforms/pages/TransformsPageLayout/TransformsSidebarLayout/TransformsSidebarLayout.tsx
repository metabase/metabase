import { type ReactNode, useContext, useLayoutEffect } from "react";

import { DataStudioContext } from "metabase/data-studio/common/contexts/DataStudioContext";
import * as Urls from "metabase/lib/urls";
import { Box, Flex } from "metabase/ui";

import { JobsSidebar } from "../JobsSidebar";
import { TransformsSidebar } from "../TransformsSidebar";
import { useTransformsCurrentTab } from "../hooks";

type TransformsSidebarLayoutParams = {
  transformId?: string;
  jobId?: string;
};

type TransformsSidebarLayoutProps = {
  children: ReactNode;
  params: TransformsSidebarLayoutParams;
};

export const TransformsSidebarLayout = ({
  children,
  params,
}: TransformsSidebarLayoutProps) => {
  const currentTab = useTransformsCurrentTab();
  const selectedTransformId = Urls.extractEntityId(params?.transformId);
  const selectedJobId = Urls.extractEntityId(params.jobId);
  const { isSidebarOpened, setIsSidebarOpened, setIsSidebarAvailable } =
    useContext(DataStudioContext);

  useLayoutEffect(() => {
    setIsSidebarOpened(true);
    setIsSidebarAvailable(true);
    return () => {
      setIsSidebarOpened(false);
      setIsSidebarAvailable(false);
    };
  }, [currentTab, setIsSidebarOpened, setIsSidebarAvailable]);

  return (
    <Flex direction="row" w="100%" h="100%">
      {isSidebarOpened && (
        <>
          {currentTab === "transforms" && (
            <TransformsSidebar selectedTransformId={selectedTransformId} />
          )}
          {currentTab === "jobs" && (
            <JobsSidebar selectedJobId={selectedJobId} />
          )}
        </>
      )}
      <Box data-testid="transforms-content" flex={1}>
        {children}
      </Box>
    </Flex>
  );
};
