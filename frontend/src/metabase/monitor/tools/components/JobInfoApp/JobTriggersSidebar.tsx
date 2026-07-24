import { Fragment } from "react";
import { t } from "ttag";

import { useGetTasksInfoQuery } from "metabase/api";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import { ActionIcon, Divider, Flex, Icon, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { Trigger } from "metabase-types/api";

import S from "./JobTriggersSidebar.module.css";

type JobTriggersSidebarProps = {
  jobKey: string;
};

export const JobTriggersSidebar = ({ jobKey }: JobTriggersSidebarProps) => {
  const { data } = useGetTasksInfoQuery();
  const dispatch = useDispatch();

  const job = data?.jobs.find((job) => job.key === jobKey);
  const triggers = job?.triggers ?? [];

  const handleClose = () => {
    dispatch(push(Urls.monitorJobs()));
  };

  return (
    <Stack
      className={S.sidebar}
      p="lg"
      gap="lg"
      bg="background_page-primary"
      data-testid="job-triggers-sidebar"
    >
      <Flex align="flex-start" justify="space-between" gap="md" wrap="nowrap">
        <Text fw="bold" style={{ wordBreak: "break-all" }}>
          {t`Triggers for ${jobKey}`}
        </Text>
        <ActionIcon aria-label={t`Close`} onClick={handleClose}>
          <Icon name="close" />
        </ActionIcon>
      </Flex>

      {job == null && <Text c="text-secondary">{t`Job not found`}</Text>}

      {job != null && triggers.length === 0 && (
        <Text c="text-secondary">{t`No triggers`}</Text>
      )}

      {triggers.map((trigger, index) => (
        <Fragment key={trigger.key}>
          {index > 0 && <Divider />}
          <TriggerDetails trigger={trigger} />
        </Fragment>
      ))}
    </Stack>
  );
};

function TriggerDetails({ trigger }: { trigger: Trigger }) {
  return (
    <Stack component="dl" gap="sm" m={0}>
      <TriggerAttribute label={t`Key`} value={trigger.key} />
      <TriggerAttribute label={t`Description`} value={trigger.description} />
      <TriggerAttribute label={t`State`} value={trigger.state} />
      <TriggerAttribute label={t`Priority`} value={trigger.priority} />
      <TriggerAttribute
        label={t`Last Fired`}
        value={trigger["previous-fire-time"]}
      />
      <TriggerAttribute
        label={t`Next Fire Time`}
        value={trigger["next-fire-time"]}
      />
      <TriggerAttribute label={t`Start Time`} value={trigger["start-time"]} />
      <TriggerAttribute label={t`End Time`} value={trigger["end-time"]} />
      <TriggerAttribute
        label={t`Final Fire Time`}
        value={trigger["final-fire-time"]}
      />
      <TriggerAttribute
        label={t`May Fire Again?`}
        value={trigger["may-fire-again?"] ? t`Yes` : t`No`}
      />
      <TriggerAttribute
        label={t`Misfire Instruction`}
        value={trigger["misfire-instruction"]}
      />
    </Stack>
  );
}

type TriggerAttributeProps = {
  label: string;
  value: string | number | null;
};

function TriggerAttribute({ label, value }: TriggerAttributeProps) {
  return (
    <Flex gap="md">
      <Text component="dt" fw="bold" w="8rem" flex="0 0 auto">
        {label}
      </Text>
      <Text component="dd" m={0} style={{ wordBreak: "break-word" }}>
        {value ?? EMPTY_CELL_PLACEHOLDER}
      </Text>
    </Flex>
  );
}
