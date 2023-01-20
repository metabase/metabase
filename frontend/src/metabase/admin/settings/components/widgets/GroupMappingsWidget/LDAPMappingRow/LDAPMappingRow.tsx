import React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Selectbox from "../LDAPMappingGroupSelect";

type LDAPMappingRowProps = {
  dn: any;
  groups: any;
  selectedGroups: any;
  onChange: () => void;
  onDelete: () => void;
};

const LDAPMappingRow = ({
  dn,
  groups,
  selectedGroups,
  onChange,
  onDelete,
}: LDAPMappingRowProps) => (
  <tr>
    <td>{dn}</td>
    <td>
      <Selectbox
        groups={groups}
        selectedGroups={selectedGroups}
        onGroupChange={onChange}
      />
    </td>
    <td className="Table-actions">
      <Button warning onClick={onDelete}>{t`Remove`}</Button>
    </td>
  </tr>
);

export default LDAPMappingRow;
