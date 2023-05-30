import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { Radio } from "metabase/core/components/Radio";
import { PLUGIN_APPLICATION_PERMISSIONS } from "metabase/plugins";

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
        { name: t`Data`, value: `data` },
        { name: t`Collections`, value: `collections` },
        ...PLUGIN_APPLICATION_PERMISSIONS.tabs,
      ]}
      onOptionClick={onChangeTab}
      variant="underlined"
    />
  </div>
);

PermissionsTabs.propTypes = propTypes;
