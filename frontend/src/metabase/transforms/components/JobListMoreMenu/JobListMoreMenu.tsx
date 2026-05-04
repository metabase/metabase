import { useState } from "react";
import { t } from "ttag";

import { useBulkUpdateTransformJobsDisabledMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Icon, Menu } from "metabase/ui";
import type { TransformJob } from "metabase-types/api";

import { DisableAllJobsModal } from "./DisableAllJobsModal";
import type { JobListMoreMenuModalType } from "./types";

type JobListMoreMenuProps = {
  jobs: TransformJob[];
};

export function JobListMoreMenu({ jobs }: JobListMoreMenuProps) {
  const [modalType, setModalType] = useState<JobListMoreMenuModalType>();
  const [bulkUpdate] = useBulkUpdateTransformJobsDisabledMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const hasEnabledJobs = jobs.some((job) => !job.disabled);
  const hasDisabledJobs = jobs.some((job) => job.disabled);

  const handleReEnableAll = async () => {
    const { error } = await bulkUpdate({ disabled: false });
    if (error) {
      sendErrorToast(t`Failed to re-enable all jobs`);
    } else {
      sendSuccessToast(t`All jobs re-enabled`);
    }
  };

  const handleDisableAllConfirmed = () => {
    sendSuccessToast(t`All jobs disabled`);
    setModalType(undefined);
  };

  return (
    <>
      <Menu>
        <Menu.Target>
          <Button leftSection={<Icon name="ellipsis" />} />
        </Menu.Target>
        <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
          {hasEnabledJobs && (
            <Menu.Item
              leftSection={<Icon name="pause" />}
              onClick={() => setModalType("disable-all")}
            >
              {t`Disable all`}
            </Menu.Item>
          )}
          {hasDisabledJobs && (
            <Menu.Item
              leftSection={<Icon name="play" />}
              onClick={handleReEnableAll}
            >
              {t`Re-enable all`}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
      {modalType === "disable-all" && (
        <DisableAllJobsModal
          onConfirm={handleDisableAllConfirmed}
          onClose={() => setModalType(undefined)}
        />
      )}
    </>
  );
}
