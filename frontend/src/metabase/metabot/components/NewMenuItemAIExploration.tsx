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

  if (!hasNlqAccess) {
    return (
      <Menu.Item
        key="research"
        component={ForwardRefLink}
        to={Urls.newExploration()}
        leftSection={<Icon name="zoom_in" />}
      >
        {t`Research`}
      </Menu.Item>
    );
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
