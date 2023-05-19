import React from "react";
import { t } from "ttag";
import NewItemMenu from "metabase/containers/NewItemMenu";
import { CollectionId } from "metabase-types/api";
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
          icon="add"
          iconSize={14}
          data-metabase-event="NavBar;Create Menu Click"
        >
          <NewButtonText>{t`New`}</NewButtonText>
        </NewButton>
      }
      collectionId={collectionId}
      analyticsContext="NavBar"
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewItemButton;
