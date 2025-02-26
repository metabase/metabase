import cx from "classnames";
import type * as React from "react";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import type {
  DeleteMappingModalValueType,
  GroupIds,
  UserGroupsType,
} from "metabase/admin/types";
import { ConfirmationModal } from "metabase/components/ConfirmationModal";
import Tooltip from "metabase/core/components/Tooltip";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { isAdminGroup } from "metabase/lib/groups";
import { Icon } from "metabase/ui";

import DeleteGroupMappingModal from "../DeleteGroupMappingModal";
import Selectbox from "../GroupSelect";

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
  clearGroupMember: ({ id }: { id: number }) => void;
  deleteGroup: ({ id }: { id: number }) => void;
  onChange: () => void;
  onDeleteMapping: OnDeleteMappingType;
};

const MappingRow = ({
  name,
  groups,
  selectedGroupIds,
  clearGroupMember,
  deleteGroup,
  onChange,
  onDeleteMapping,
}: MappingRowProps) => {
  const [deleteGroupMappingModalIsOpen, setDeleteGroupMappingModalIsOpen] =
    useState(false);
  const handleOpenDeleteGroupMappingModal = () => {
    setDeleteGroupMappingModalIsOpen(true);
  };
  const handleCloseDeleteGroupMappingModal = () => {
    setDeleteGroupMappingModalIsOpen(false);
  };

  const [deleteMappingModalIsOpen, setDeleteMappingModalIsOpen] =
    useState(false);
  const handleOpenDeleteMappingModal = () => {
    setDeleteMappingModalIsOpen(true);
  };
  const handleCloseDeleteMappingModal = () => {
    setDeleteMappingModalIsOpen(false);
  };

  // Mappings may receive group ids even from the back-end
  // if the groups themselves have been deleted.
  // Let's ensure this row works with the ones that exist.
  const selectedGroupIdsFromGroupsThatExist = selectedGroupIds.filter(id =>
    _.findWhere(groups, { id: id }),
  );

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
    groupIds: GroupIds,
  ) => {
    switch (whatToDoAboutGroups) {
      case "clear":
        return () =>
          Promise.all(
            groupIds.map(async id => {
              try {
                if (!isAdminGroup(groups.find(group => group.id === id))) {
                  await clearGroupMember({ id });
                }
              } catch (error) {
                console.error(error);
              }
            }),
          );
      case "delete":
        return () =>
          Promise.all(
            groupIds.map(async id => {
              try {
                if (!isAdminGroup(groups.find(group => group.id === id))) {
                  await deleteGroup({ id });
                }
              } catch (error) {
                console.error(error);
              }
            }),
          );
      default:
        return () => null;
    }
  };

  const firstGroupInMapping = groups.find(
    group => group.id === selectedGroupIdsFromGroupsThatExist[0],
  );

  const isMappingLinkedOnlyToAdminGroup =
    groups.length > 0 &&
    selectedGroupIdsFromGroupsThatExist.length === 1 &&
    isAdminGroup(firstGroupInMapping);

  const shouldUseDeleteGroupMappingModal =
    selectedGroupIdsFromGroupsThatExist.length > 0 &&
    !isMappingLinkedOnlyToAdminGroup;

  return (
    <>
      <tr>
        <td>{name}</td>
        <td>
          <Selectbox
            groups={groups}
            selectedGroupIds={selectedGroupIdsFromGroupsThatExist}
            onGroupChange={onChange}
          />
        </td>
        <td className={AdminS.TableActions}>
          <div className={cx(CS.floatRight, CS.mr1)}>
            <DeleteButton
              onDelete={() =>
                shouldUseDeleteGroupMappingModal
                  ? handleOpenDeleteGroupMappingModal()
                  : handleOpenDeleteMappingModal()
              }
            />
          </div>
        </td>
      </tr>
      <ConfirmationModal
        opened={deleteMappingModalIsOpen}
        title={t`Delete this mapping?`}
        onClose={handleCloseDeleteMappingModal}
        onConfirm={() => {
          onDeleteMapping({ name });
          handleCloseDeleteMappingModal();
        }}
      />
      {deleteGroupMappingModalIsOpen && (
        <DeleteGroupMappingModal
          name={name}
          groupIds={selectedGroupIds}
          onHide={handleCloseDeleteGroupMappingModal}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MappingRow;
