import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { resetConversation } from "metabase/metabot/state";
import { useDispatch } from "metabase/redux";
import { Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CollectionId } from "metabase-types/api";

interface NewMenuItemAIExplorationProps {
  collectionId?: CollectionId;
}

export function NewMenuItemAIExploration({
  collectionId,
}: NewMenuItemAIExplorationProps) {
  const dispatch = useDispatch();

  return (
    <Menu.Item
      component={ForwardRefLink}
      to={Urls.newQuestion({
        mode: "ask",
        collectionId,
        cardType: "question",
      })}
      leftSection={<Icon name="comment" />}
      onClick={() => dispatch(resetConversation({ agentId: "ask" }))}
    >
      {t`AI exploration`}
    </Menu.Item>
  );
}
