import React, { useState } from "react";
import { t } from "ttag";
import { isAdminGroup } from "metabase/lib/groups";

import { PermissionsApi } from "metabase/services";
import Tooltip from "metabase/core/components/Tooltip";
import Icon from "metabase/components/Icon";
import Confirm from "metabase/components/Confirm";

import Selectbox from "../GroupSelect";
import DeleteGroupMappingModal from "../DeleteGroupMappingModal";

import type {
  DeleteMappingModalValueType,
  GroupIds,
  UserGroupsType,
} from "../types";

import { DeleteMappingButton } from "./MappingRow.styled";

type OnDeleteMappingType = (arg: {
  name: string;
  groupIdsToDelete?: GroupIds;
  onSuccess?: () => void;
}) => void;

type MappingRowProps = {
  name: string;
  groups: UserGroupsType;
  selectedGroupIds: GroupIds;
  onChange: () => void;
  onDeleteMapping: OnDeleteMappingType;
};

const MappingRow = ({
  name,
  groups,
  selectedGroupIds,
  onChange,
  onDeleteMapping,
}: MappingRowProps) => {
  const [showDeleteMappingModal, setShowDeleteMappingModal] = useState(false);

  const handleShowDeleteMappingModal = () => {
    setShowDeleteMappingModal(true);
  };

  const handleHideDeleteMappingModal = () => {
    setShowDeleteMappingModal(false);
  };

  const handleConfirmDeleteMapping = (
    whatToDoAboutGroups: DeleteMappingModalValueType,
    groups: GroupIds,
  ) => {
    const onSuccess = getCallbackForGroupsAfterDeletingMapping(
      whatToDoAboutGroups,
      groups,
    );

    const groupIdsToDelete =
      whatToDoAboutGroups === "delete" ? selectedGroupIds : [];

    onDeleteMapping({ name, onSuccess, groupIdsToDelete });
  };

  const getCallbackForGroupsAfterDeletingMapping = (
    whatToDoAboutGroups: DeleteMappingModalValueType,
    groups: GroupIds,
  ) => {
    switch (whatToDoAboutGroups) {
      case "clear":
        return () =>
          groups.forEach(id => PermissionsApi.clearGroupMembership({ id }));
      case "delete":
        return () => groups.forEach(id => PermissionsApi.deleteGroup({ id }));
      default:
        return () => null;
    }
  };

  const isMappingLinkedOnlyToAdminGroup =
    groups.length > 0 &&
    selectedGroupIds.length === 1 &&
    isAdminGroup(groups.find(group => group.id === selectedGroupIds[0]));

  const shouldUseDeleteMappingModal =
    selectedGroupIds.length > 0 && !isMappingLinkedOnlyToAdminGroup;

  const onDelete = shouldUseDeleteMappingModal
    ? () => handleShowDeleteMappingModal()
    : () => onDeleteMapping({ name });

  return (
    <>
      <tr>
        <td>{name}</td>
        <td>
          <Selectbox
            groups={groups}
            selectedGroupIds={selectedGroupIds}
            onGroupChange={onChange}
          />
        </td>
        <td className="Table-actions">
          <div className="float-right mr1">
            {shouldUseDeleteMappingModal ? (
              <DeleteButton onDelete={onDelete} />
            ) : (
              <Confirm action={onDelete} title={t`Delete this mapping?`}>
                <DeleteButton />
              </Confirm>
            )}
          </div>
        </td>
      </tr>
      {showDeleteMappingModal && (
        <DeleteGroupMappingModal
          name={name}
          groupIds={selectedGroupIds}
          onHide={handleHideDeleteMappingModal}
          onConfirm={handleConfirmDeleteMapping}
        />
      )}
    </>
  );
};

const DeleteButton = ({
  onDelete,
}: {
  onDelete?: React.MouseEventHandler<HTMLButtonElement>;
}) => (
  <Tooltip tooltip={t`Remove mapping`} placement="top">
    <DeleteMappingButton onClick={onDelete}>
      <Icon name="close" />
    </DeleteMappingButton>
  </Tooltip>
);

export default MappingRow;
