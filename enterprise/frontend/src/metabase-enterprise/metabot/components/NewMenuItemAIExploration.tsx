import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import { Icon, Menu } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

export function getNewMenuItemAIExploration(
  hasDataAccess: boolean,
  collectionId?: CollectionId,
) {
  if (!hasDataAccess) {
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
