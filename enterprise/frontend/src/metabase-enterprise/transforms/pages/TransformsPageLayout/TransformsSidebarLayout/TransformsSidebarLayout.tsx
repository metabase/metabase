import { Box, Flex } from "metabase/ui";

import { JobsSidebar } from "../JobsSidebar";
import { TransformsSidebar } from "../TransformsSidebar";
import { useTransformsCurrentTab } from "../hooks";

interface TransformsSidebarLayoutProps {
  children: React.ReactNode;
  params?: {
    transformId?: string;
    jobId?: string;
  };
}

export const TransformsSidebarLayout = ({
  children,
  params,
}: TransformsSidebarLayoutProps) => {
  const currentTab = useTransformsCurrentTab();

  const selectedTransformId = params?.transformId
    ? parseInt(params.transformId, 10)
    : undefined;

  const selectedJobId = params?.jobId ? parseInt(params.jobId, 10) : undefined;

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
