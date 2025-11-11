import type { ReactNode } from "react";

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

  return (
    <Flex direction="row" w="100%" h="100%">
      {currentTab === "transforms" && (
        <TransformsSidebar selectedTransformId={selectedTransformId} />
      )}
      {currentTab === "jobs" && <JobsSidebar selectedJobId={selectedJobId} />}
      <Box data-testid="transforms-content" flex={1}>
        {children}
      </Box>
    </Flex>
  );
};
