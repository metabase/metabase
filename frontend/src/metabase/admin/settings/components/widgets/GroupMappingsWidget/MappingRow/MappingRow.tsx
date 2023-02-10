import React, { useState } from "react";
import { t } from "ttag";
import { isAdminGroup } from "metabase/lib/groups";

import { PermissionsApi } from "metabase/services";
import Tooltip from "metabase/core/components/Tooltip";
import Icon from "metabase/components/Icon";
import Confirm from "metabase/components/Confirm";

import Selectbox from "../GroupSelect";
import DeleteGroupMappingModal from "../DeleteGroupMappingModal";

import type { DeleteMappingModalValueType } from "../DeleteGroupMappingModal";
import type { DNType, GroupIds } from "../types";

import { DeleteMappingButton } from "./MappingRow.styled";

type OnDeleteMappingType = (dn: string, onSuccess?: () => void) => void;

type MappingRowProps = {
  dn: DNType;
  groups: GroupIds;
  selectedGroupIds: GroupIds;
  onChange: () => void;
  onDeleteMapping: OnDeleteMappingType;
};

const MappingRow = ({
  dn,
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
    whatToDoAboutGroups: any,
    groups: any,
  ) => {
    const onSuccess = getCallbackForGroupsAfterDeletingMapping(
      whatToDoAboutGroups,
      groups,
    );

    onDeleteMapping(dn, onSuccess);
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
    isAdminGroup(groups.find((group: any) => group.id === selectedGroupIds[0]));

  const shouldUseDeleteMappingModal =
    selectedGroupIds.length > 0 && !isMappingLinkedOnlyToAdminGroup;

  const onDelete = shouldUseDeleteMappingModal
    ? () => handleShowDeleteMappingModal()
    : () => onDeleteMapping(dn);

  return (
    <>
      <tr>
        <td>{dn}</td>
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
          dn={dn}
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
