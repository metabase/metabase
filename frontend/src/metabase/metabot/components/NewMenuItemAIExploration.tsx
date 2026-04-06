import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type { CollectionId } from "metabase-types/api";

export function getNewMenuItemAIExploration(
  hasDataAccess: boolean,
  collectionId?: CollectionId,
  canUseNlq?: boolean,
) {
  if (!hasDataAccess || !canUseNlq) {
    return undefined;
  }

  return (
    <Menu.Item
      key="nlq"
      component={ForwardRefLink}
      to={Urls.newQuestion({
        mode: "ask",
        collectionId,
        cardType: "question",
      })}
      leftSection={<Icon name="comment" />}
    >
      {t`AI exploration`}
    </Menu.Item>
  );
}
