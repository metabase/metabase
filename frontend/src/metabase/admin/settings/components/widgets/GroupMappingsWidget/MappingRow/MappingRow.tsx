import React from "react";
import { t } from "ttag";
import { isAdminGroup } from "metabase/lib/groups";

import Button from "metabase/core/components/Button";
import Selectbox from "../GroupSelect";

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
  savedMappings,
  onChange,
  onShowDeleteMappingModal,
  onDeleteMapping,
}: MappingRowProps) => {
  const isMappingLinkedOnlyToAdminGroup =
    groups.length > 0 &&
    selectedGroupIds.length === 1 &&
    isAdminGroup(groups.find((group: any) => group.id === selectedGroupIds[0]));

  const isSavedMapping = Object.keys(savedMappings).includes(dn);

  const shouldUseDeleteMappingModal =
    selectedGroupIds.length > 0 &&
    !isMappingLinkedOnlyToAdminGroup &&
    isSavedMapping;

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
        <Button warning onClick={onDelete}>{t`Remove`}</Button>
      </td>
    </tr>
  );
};

export default MappingRow;
