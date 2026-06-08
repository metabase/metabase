import { useState } from "react";
import { t } from "ttag";

import { useBulkUpdateTransformJobsActiveMutation } from "metabase/api";
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
  const [bulkUpdate] = useBulkUpdateTransformJobsActiveMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const hasEnabledJobs = jobs.some((job) => job.active);
  const hasDisabledJobs = jobs.some((job) => !job.active);

  const handleReEnableAll = async () => {
    const { data, error } = await bulkUpdate({ active: true });
    if (error || (data?.failed ?? 0) > 0) {
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
          <Button
            aria-label={t`More job options`}
            leftSection={<Icon name="ellipsis" />}
          />
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
