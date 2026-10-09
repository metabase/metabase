import type { MouseEvent } from "react";
import { t } from "ttag";

import { useUpdateTransformJobMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import { useNavigate } from "metabase/router";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { TransformJob } from "metabase-types/api";

import { DeleteJobModal } from "./DeleteJobModal";

type DeleteJobModalState = {
  type: "delete";
  job: TransformJob;
};

export type JobModalState = DeleteJobModalState;

type JobMoreMenuProps = {
  job: TransformJob;
  onOpenModal: (modal: JobModalState) => void;
};

export function JobMoreMenu({ job, onOpenModal }: JobMoreMenuProps) {
  const [updateJob] = useUpdateTransformJobMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleToggleDisabled = async () => {
    const nextActive = !job.active;
    const { error } = await updateJob({ id: job.id, active: nextActive });
    if (error) {
      sendErrorToast(
        nextActive ? t`Failed to enable job` : t`Failed to disable job`,
      );
    } else {
      sendSuccessToast(nextActive ? t`Job enabled` : t`Job disabled`);
    }
  };

  return (
    <JobMenu
      isDisabled={!job.active}
      onDeleteClick={() => onOpenModal({ type: "delete", job })}
      onToggleDisabled={handleToggleDisabled}
    />
  );
}

type JobMenuProps = {
  isDisabled: boolean;
  onDeleteClick: () => void;
  onToggleDisabled: () => void;
};

function JobMenu({
  isDisabled,
  onDeleteClick,
  onToggleDisabled,
}: JobMenuProps) {
  const handleIconClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Menu>
      <Menu.Target>
        <ActionIcon onClick={handleIconClick}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        <Menu.Item
          leftSection={<Icon name={isDisabled ? "play" : "pause"} />}
          onClick={onToggleDisabled}
        >
          {isDisabled ? t`Re-enable` : t`Disable`}
        </Menu.Item>
        <Menu.Item leftSection={<Icon name="trash" />} onClick={onDeleteClick}>
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

type JobModalProps = {
  modal: JobModalState | undefined;
  onClose: () => void;
};

export function JobModal({ modal, onClose }: JobModalProps) {
  const { sendSuccessToast } = useMetadataToasts();
  const navigate = useNavigate();

  if (modal === undefined) {
    return null;
  }

  const handleDelete = () => {
    sendSuccessToast(t`Job deleted`);
    navigate(Urls.transformJobList());
    onClose();
  };

  return (
    <DeleteJobModal job={modal.job} onDelete={handleDelete} onClose={onClose} />
  );
}
