import { type MouseEvent, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useUpdateTransformJobMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { TransformJob } from "metabase-types/api";

import { DeleteJobModal } from "./DeleteJobModal";
import type { JobMoreMenuModalType } from "./types";

type JobMoreMenuProps = {
  job: TransformJob;
};

export function JobMoreMenu({ job }: JobMoreMenuProps) {
  const [modalType, setModalType] = useState<JobMoreMenuModalType>();
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
    <>
      <JobMenu
        isDisabled={!job.active}
        onOpenModal={setModalType}
        onToggleDisabled={handleToggleDisabled}
      />
      {modalType != null && (
        <JobModal
          job={job}
          modalType={modalType}
          onClose={() => setModalType(undefined)}
        />
      )}
    </>
  );
}

type JobMenuProps = {
  isDisabled: boolean;
  onOpenModal: (modalType: JobMoreMenuModalType) => void;
  onToggleDisabled: () => void;
};

function JobMenu({ isDisabled, onOpenModal, onToggleDisabled }: JobMenuProps) {
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
        <Menu.Item
          leftSection={<Icon name="trash" />}
          onClick={() => onOpenModal("delete")}
        >
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

type JobModalProps = {
  job: TransformJob;
  modalType: JobMoreMenuModalType;
  onClose: () => void;
};

function JobModal({ job, modalType, onClose }: JobModalProps) {
  const { sendSuccessToast } = useMetadataToasts();
  const dispatch = useDispatch();

  const handleDelete = () => {
    sendSuccessToast(t`Job deleted`);
    dispatch(push(Urls.transformJobList()));
    onClose();
  };

  switch (modalType) {
    case "delete":
      return (
        <DeleteJobModal job={job} onDelete={handleDelete} onClose={onClose} />
      );
    default:
      return null;
  }
}
