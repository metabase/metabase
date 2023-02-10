import React from "react";
import { t } from "ttag";
import { isAdminGroup } from "metabase/lib/groups";

import Tooltip from "metabase/core/components/Tooltip";
import Icon from "metabase/components/Icon";
import Confirm from "metabase/components/Confirm";

import Selectbox from "../GroupSelect";
import { DeleteMappingButton } from "./MappingRow.styled";

type OnDeleteMappingType = (dn: string) => void;
type OnShowDeleteMappingModalType = (selectedGroupIds: any, dn: any) => void;

type MappingRowProps = {
  dn: any;
  groups: any;
  selectedGroupIds: any;
  savedMappings: any;
  onChange: () => void;
  onShowDeleteMappingModal: OnShowDeleteMappingModalType;
  onDeleteMapping: OnDeleteMappingType;
};

const MappingRow = ({
  dn,
  groups,
  selectedGroupIds,
  onChange,
  onShowDeleteMappingModal,
  onDeleteMapping,
}: MappingRowProps) => {
  const isMappingLinkedOnlyToAdminGroup =
    groups.length > 0 &&
    selectedGroupIds.length === 1 &&
    isAdminGroup(groups.find((group: any) => group.id === selectedGroupIds[0]));

  const shouldUseDeleteMappingModal =
    selectedGroupIds.length > 0 && !isMappingLinkedOnlyToAdminGroup;

  const onDelete = shouldUseDeleteMappingModal
    ? () => onShowDeleteMappingModal(selectedGroupIds, dn)
    : () => onDeleteMapping(dn);

  return (
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
