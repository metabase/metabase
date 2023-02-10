import React from "react";
import { t } from "ttag";
import { isAdminGroup } from "metabase/lib/groups";

import Tooltip from "metabase/core/components/Tooltip";
import Icon from "metabase/components/Icon";

import Selectbox from "../GroupSelect";
import { DeleteMappingButton } from "./MappingRow.styled";

type MappingRowProps = {
  dn: any;
  groups: any;
  selectedGroupIds: any;
  savedMappings: any;
  onChange: () => void;
  onShowDeleteMappingModal: (selectedGroupIds: any, dn: any) => void;
  onDeleteMapping: (dn: any) => void;
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
          <Tooltip tooltip={t`Remove mapping`} placement="top">
            <DeleteMappingButton onClick={onDelete}>
              <Icon name="close" />
            </DeleteMappingButton>
          </Tooltip>
        </div>
      </td>
    </tr>
  );
};

export default MappingRow;
