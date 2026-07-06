import type { ReactNode } from "react";
import { t } from "ttag";

import { useGetTasksInfoQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { Center, Code, Flex, Stack } from "metabase/ui";

import S from "./JobInfoApp.module.css";
import { JobsTable } from "./JobsTable";

type JobInfoAppProps = {
  children?: ReactNode;
};

export const JobInfoApp = ({ children }: JobInfoAppProps) => {
  const { data, error, isFetching } = useGetTasksInfoQuery();

  return (
    <Flex h="100%" wrap="nowrap">
      <Stack className={S.main} flex={1} gap="md">
        <MonitorHeaderTitle>{t`Scheduler Info`}</MonitorHeaderTitle>
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
        {
          // render 'children' so that the job triggers modal shows up
          children
        }
      </Stack>
    </Flex>
  );
};
