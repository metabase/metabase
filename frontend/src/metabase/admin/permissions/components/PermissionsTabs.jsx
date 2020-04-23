import React from "react";

import { t } from "ttag";

import Radio from "metabase/components/Radio";

const PermissionsTabs = ({ tab, onChangeTab }) => (
  <div className="px3 mt2 ml2">
    <Radio
      value={tab}
      options={[
        { name: t`Data permissions`, value: `databases` },
        { name: t`Collection permissions`, value: `collections` },
      ]}
      onChange={onChangeTab}
      underlined
      py={1}
    />
  </div>
);
export default PermissionsTabs;
