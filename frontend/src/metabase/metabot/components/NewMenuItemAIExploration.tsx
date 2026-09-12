import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CollectionId } from "metabase-types/api";

interface NewMenuItemAIExplorationProps {
  collectionId?: CollectionId;
}

export function NewMenuItemAIExploration({
  collectionId,
}: NewMenuItemAIExplorationProps) {
  const url = Urls.newQuestion({
    mode: "ask",
    collectionId,
    cardType: "question",
  });

  return (
    <Menu.Item
      component={ForwardRefLink}
      to={url}
      leftSection={<Icon name="comment" />}
    >
      {t`AI exploration`}
    </Menu.Item>
  );
}
