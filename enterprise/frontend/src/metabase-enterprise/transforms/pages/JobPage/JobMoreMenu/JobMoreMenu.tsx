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
  job: TransformJob;
};

export function JobMoreMenu({ job }: JobMoreMenuProps) {
  const [modalType, setModalType] = useState<JobMoreMenuModalType>();

  return (
    <>
      <JobMenu onOpenModal={setModalType} />
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
  onOpenModal: (modalType: JobMoreMenuModalType) => void;
};

function JobMenu({ onOpenModal }: JobMenuProps) {
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
