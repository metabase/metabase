import { type ReactNode, useContext, useLayoutEffect } from "react";

import * as Urls from "metabase/lib/urls";
import { Box, Flex } from "metabase/ui";
import { DataStudioContext } from "metabase-enterprise/data-studio/common/contexts/DataStudioContext";

import { JobsSidebar } from "./JobsSidebar";
import { TransformsSidebar } from "./TransformsSidebar";
import { useTransformsCurrentTab } from "./hooks";

type TransformSidebarLayoutParams = {
  transformId?: string;
  jobId?: string;
};

type TransformSidebarLayoutProps = {
  children: ReactNode;
  params: TransformSidebarLayoutParams;
};

export const TransformSidebarLayout = ({
  children,
  params,
}: TransformSidebarLayoutProps) => {
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
      <Box data-testid="transforms-content" flex={1} miw={0}>
        {children}
      </Box>
    </Flex>
  );
};
