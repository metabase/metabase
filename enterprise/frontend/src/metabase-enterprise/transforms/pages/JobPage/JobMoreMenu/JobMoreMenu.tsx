import { type MouseEvent, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { TransformJob } from "metabase-types/api";

import { DeleteJobModal } from "./DeleteJobModal";
import type { JobMoreMenuModalType } from "./types";

type JobMoreMenuProps = {
  onOpenModal: (modalType: JobMoreMenuModalType) => void;
};

export function JobMoreMenu({ onOpenModal }: JobMoreMenuProps) {
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
          onClick={() => onOpenModal("delete")}
        >
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

type JobMoreMenuModalProps = {
  job: TransformJob;
  modalType: JobMoreMenuModalType;
  onClose: () => void;
};

export function JobMoreMenuModal({
  job,
  modalType,
  onClose,
}: JobMoreMenuModalProps) {
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

type JobMoreMenuWithModalProps = {
  job: TransformJob;
};

export function JobMoreMenuWithModal({ job }: JobMoreMenuWithModalProps) {
  const [modalType, setModalType] = useState<JobMoreMenuModalType>();

  return (
    <>
      <JobMoreMenu onOpenModal={setModalType} />
      {modalType != null && (
        <JobMoreMenuModal
          job={job}
          modalType={modalType}
          onClose={() => setModalType(undefined)}
        />
      )}
    </>
  );
}
