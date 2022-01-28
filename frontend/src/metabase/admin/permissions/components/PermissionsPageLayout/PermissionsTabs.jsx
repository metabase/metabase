import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Radio from "metabase/core/components/Radio";

const propTypes = {
  tab: PropTypes.oneOf(["data", "collections"]).isRequired,
  onChangeTab: PropTypes.func.isRequired,
};

export const PermissionsTabs = ({ tab, onChangeTab }) => (
  <div className="px3 mt1">
    <Radio
      colorScheme="accent7"
      value={tab}
      options={[
        { name: t`Data permissions`, value: `data` },
        { name: t`Collection permissions`, value: `collections` },
      ]}
      onOptionClick={onChangeTab}
      variant="underlined"
    />
  </div>
);

PermissionsTabs.propTypes = propTypes;
