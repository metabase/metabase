import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Icon, Menu } from "metabase/ui";

export function getNewMenuItemAIExploration(
  hasDataAccess: boolean,
  canUseNlq?: boolean,
) {
  if (!hasDataAccess || !canUseNlq) {
    return undefined;
  }

  return (
    <Menu.Item
      key="nlq"
      component={ForwardRefLink}
      to="/"
      leftSection={<Icon name="comment" />}
    >
      {t`AI exploration`}
    </Menu.Item>
  );
}
