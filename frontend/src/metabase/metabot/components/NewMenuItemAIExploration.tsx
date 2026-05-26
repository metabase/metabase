import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CollectionId } from "metabase-types/api";

export function getNewMenuItemAIExploration(
  hasDataAccess: boolean,
  collectionId?: CollectionId,
  hasNlqAccess?: boolean,
) {
  if (!hasDataAccess) {
    return undefined;
  }

  const url = hasNlqAccess
    ? Urls.newQuestion({
        mode: "ask",
        collectionId,
        cardType: "question",
      })
    : Urls.newExploration();

  return (
    <Menu.Item
      key="nlq"
      component={ForwardRefLink}
      to={url}
      leftSection={<Icon name="comment" />}
    >
      {t`AI exploration`}
    </Menu.Item>
  );
}
