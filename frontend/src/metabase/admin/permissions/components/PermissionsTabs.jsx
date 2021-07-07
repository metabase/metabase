/* eslint-disable react/prop-types */
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
      variant="underlined"
      py={2}
    />
  </div>
);
export default PermissionsTabs;
