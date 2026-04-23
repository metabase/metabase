import { t } from "ttag";

import { NewItemMenu } from "metabase/common/components/NewItemMenu";
import { Button, Icon } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { trackAppNewButtonClicked } from "./analytics";

export interface NewItemButtonProps {
  collectionId?: CollectionId;
}

const NewItemButton = ({ collectionId }: NewItemButtonProps) => {
  return (
    <NewItemMenu
      trigger={
        <Button
          variant="filled"
          size="sm"
          p="sm"
          leftSection={<Icon name="add" size={16} />}
          aria-label={t`New`}
          onClick={() => trackAppNewButtonClicked()}
        >
          {t`New`}
        </Button>
      }
      collectionId={collectionId}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewItemButton;
