import { type MouseEvent, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { TransformJobId } from "metabase-types/api";

import type { JobMoreMenuModalState } from "../../types";

import { DeleteJobModal } from "./DeleteJobModal";

type JobMoreMenuProps = {
  jobId: TransformJobId;
  onOpenModal: (modal: JobMoreMenuModalState) => void;
};

export function JobMoreMenu({ jobId, onOpenModal }: JobMoreMenuProps) {
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
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="trash" />}
          onClick={() => onOpenModal({ jobId, modalType: "delete" })}
        >
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

type JobMoreMenuModalProps = {
  modal: JobMoreMenuModalState;
  onClose: () => void;
};

export function JobMoreMenuModal({ modal, onClose }: JobMoreMenuModalProps) {
  const { sendSuccessToast } = useMetadataToasts();
  const dispatch = useDispatch();

  const handleDelete = () => {
    sendSuccessToast(t`Job deleted`);
    dispatch(push(Urls.transformJobList()));
    onClose();
  };

  switch (modal.modalType) {
    case "delete":
      return (
        <DeleteJobModal
          jobId={modal.jobId}
          onDelete={handleDelete}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
}

type JobMoreMenuWithModalProps = {
  jobId: TransformJobId;
};

export function JobMoreMenuWithModal({ jobId }: JobMoreMenuWithModalProps) {
  const [modal, setModal] = useState<JobMoreMenuModalState>();

  return (
    <>
      <JobMoreMenu jobId={jobId} onOpenModal={setModal} />
      {modal != null && (
        <JobMoreMenuModal modal={modal} onClose={() => setModal(undefined)} />
      )}
    </>
  );
}
