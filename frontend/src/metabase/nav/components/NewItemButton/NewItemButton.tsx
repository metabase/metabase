import { t } from "ttag";

import { NewItemMenu } from "metabase/nav/components/NewItemMenu";
import { ActionIcon, Icon } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { trackAppNewButtonClicked } from "./analytics";

export interface NewItemButtonProps {
  collectionId?: CollectionId;
}

const NewItemButton = ({ collectionId }: NewItemButtonProps) => {
  return (
    <NewItemMenu
      trigger={
        <ActionIcon
          variant="filled"
          aria-label={t`New`}
          onClick={() => trackAppNewButtonClicked()}
        >
          <Icon name="add" />
        </ActionIcon>
      }
      collectionId={collectionId}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewItemButton;
