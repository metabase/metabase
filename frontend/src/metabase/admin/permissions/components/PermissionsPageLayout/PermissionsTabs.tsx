import cx from "classnames";
import { t } from "ttag";

import Radio from "metabase/core/components/Radio";
import CS from "metabase/css/core/index.css";
import { PLUGIN_APPLICATION_PERMISSIONS } from "metabase/plugins";

import type { PermissionsPageTab } from "./PermissionsPageLayout";

interface PermissionsTabsProps {
  tab: PermissionsPageTab;
  onChangeTab: (tab: PermissionsPageTab) => void;
}

export const PermissionsTabs = ({ tab, onChangeTab }: PermissionsTabsProps) => (
  <div className={cx(CS.px3, CS.mt1)}>
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
