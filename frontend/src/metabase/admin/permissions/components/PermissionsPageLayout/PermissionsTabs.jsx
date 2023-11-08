import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Radio from "metabase/components/Radio";

const propTypes = {
  tab: PropTypes.oneOf(["data", "collections"]).isRequired,
  onChangeTab: PropTypes.func.isRequired,
};

export const PermissionsTabs = ({ tab, onChangeTab }) => (
  <div className="px3 mt1">
    <Radio
      colorScheme="admin"
      value={tab}
      options={[
        { name: t`Data permissions`, value: `data` },
        { name: t`Collection permissions`, value: `collections` },
      ]}
      onOptionClick={onChangeTab}
      variant="underlined"
      py={2}
    />
  </div>
);

PermissionsTabs.propTypes = propTypes;
