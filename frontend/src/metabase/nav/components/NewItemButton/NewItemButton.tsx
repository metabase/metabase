import { t } from "ttag";

import { NewItemMenu } from "metabase/nav/components/NewItemMenu";
import { Button, Icon } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { trackAppNewButtonClicked } from "./analytics";

export interface NewItemButtonProps {
  collectionId?: CollectionId;
  /** PROTOTYPE: leaves out the menu's AI exploration item. */
  hideAIExploration?: boolean;
}

const NewItemButton = ({
  collectionId,
  hideAIExploration,
}: NewItemButtonProps) => {
  return (
    <NewItemMenu
      trigger={
        <Button
          variant="filled"
          leftSection={<Icon name="add" size={16} />}
          aria-label={t`New`}
          onClick={() => trackAppNewButtonClicked()}
        >
          {t`New`}
        </Button>
      }
      collectionId={collectionId}
      hideAIExploration={hideAIExploration}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewItemButton;
