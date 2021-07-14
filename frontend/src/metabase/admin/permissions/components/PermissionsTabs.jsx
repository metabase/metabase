/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";

import Radio from "metabase/components/Radio";

const PermissionsTabs = ({ tab, onChangeTab }) => (
  <div className="px3 mt1">
    <Radio
      colorScheme="admin"
      value={tab}
      options={[
        { name: t`Data permissions`, value: `databases` },
        { name: t`Collection permissions`, value: `collections` },
      ]}
      onOptionClick={onChangeTab}
      variant="underlined"
      py={2}
    />
  </div>
);
export default PermissionsTabs;
