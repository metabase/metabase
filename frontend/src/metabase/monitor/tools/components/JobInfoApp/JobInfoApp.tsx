import { useElementSize } from "@mantine/hooks";
import { t } from "ttag";

import { useGetTasksInfoQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import type { WithRouterProps } from "metabase/router";
import { Center, Code, Flex } from "metabase/ui";

import { JobTriggersSidebar } from "./JobTriggersSidebar";
import { JobsTable } from "./JobsTable";

type RouteParams = {
  jobKey?: string;
};

export const JobInfoApp = ({ params }: WithRouterProps<RouteParams>) => {
  const { data, error, isFetching } = useGetTasksInfoQuery();
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const { jobKey } = params;

  return (
    <Flex ref={containerRef} h="100%" wrap="nowrap">
      <MonitorMain>
        <MonitorHeaderTitle mb="sm">{t`Scheduled jobs`}</MonitorHeaderTitle>
        {error != null ? (
          <Center flex={1}>
            <DelayedLoadingAndErrorWrapper loading={isFetching} error={error} />
          </Center>
        ) : (
          <>
            {data != null && data.scheduler.length > 0 && (
              <Code block p="xl" style={{ flexShrink: 0 }}>
                {data.scheduler.join("\n")}
              </Code>
            )}
            <JobsTable jobs={data?.jobs ?? []} isLoading={isFetching} />
          </>
        )}
      </MonitorMain>
      {jobKey != null && data != null && (
        <Sidebar containerWidth={containerWidth}>
          <JobTriggersSidebar jobKey={jobKey} />
        </Sidebar>
      )}
    </Flex>
  );
};
