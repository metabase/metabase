import React from "react";
import { t } from "ttag";
import { CollectionId } from "metabase-types/api";
import { NewButton, NewButtonText, NewMenu } from "./NewItemButton.styled";

export interface NewItemButtonProps {
  collectionId?: CollectionId;
}

const NewItemButton = ({ collectionId }: NewItemButtonProps) => {
  return (
    <NewMenu
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
      analyticsContext={"NavBar"}
    />
  );
};

export default NewItemButton;
