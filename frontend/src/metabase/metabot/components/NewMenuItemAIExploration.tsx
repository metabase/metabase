import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";

export function NewMenuItemAIExploration() {
  return (
    <Menu.Item
      component={ForwardRefLink}
      to={Urls.askQuestion()}
      leftSection={<Icon name="comment" />}
    >
      {t`AI exploration`}
    </Menu.Item>
  );
}
