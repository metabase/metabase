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
import Confirm from "metabase/components/Confirm";
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
  const [showDeleteMappingModal, setShowDeleteMappingModal] = useState(false);

  // Mappings may receive group ids even from the back-end
  // if the groups themselves have been deleted.
  // Let's ensure this row works with the ones that exist.
  const selectedGroupIdsFromGroupsThatExist = selectedGroupIds.filter(id =>
    _.findWhere(groups, { id: id }),
  );

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

  const shouldUseDeleteMappingModal =
    selectedGroupIdsFromGroupsThatExist.length > 0 &&
    !isMappingLinkedOnlyToAdminGroup;

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
            selectedGroupIds={selectedGroupIdsFromGroupsThatExist}
            onGroupChange={onChange}
          />
        </td>
        <td className={AdminS.TableActions}>
          <div className={cx(CS.floatRight, CS.mr1)}>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MappingRow;
