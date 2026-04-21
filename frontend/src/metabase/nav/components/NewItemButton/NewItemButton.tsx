import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { NewItemMenu } from "metabase/common/components/NewItemMenu";
import type { CollectionId } from "metabase-types/api";

import S from "./NewItemButton.module.css";
import { trackAppNewButtonClicked } from "./analytics";

export interface NewItemButtonProps {
  collectionId?: CollectionId;
}

const NewItemButton = ({ collectionId }: NewItemButtonProps) => {
  return (
    <NewItemMenu
      trigger={
        <Button
          className={S.root}
          primary
          icon="add"
          iconSize={16}
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
