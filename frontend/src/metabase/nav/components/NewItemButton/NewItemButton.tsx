import { t } from "ttag";

import NewItemMenu from "metabase/containers/NewItemMenu";
import type { CollectionId } from "metabase-types/api";

import { NewButton, NewButtonText } from "./NewItemButton.styled";

export interface NewItemButtonProps {
  collectionId?: CollectionId;
}

const NewItemButton = ({ collectionId }: NewItemButtonProps) => {
  return (
    <NewItemMenu
      trigger={
        <NewButton
          primary
          icon="insight"
          aria-label={t`Go`}
          data-testid="go-menu-button"
        >
          <NewButtonText>{t`Go`}</NewButtonText>
        </NewButton>
      }
      collectionId={collectionId}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewItemButton;
