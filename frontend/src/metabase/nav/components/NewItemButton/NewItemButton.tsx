import React from "react";
import { t } from "ttag";
import NewItemMenu from "metabase/containers/NewItemMenu";
import { NewButton, NewButtonText } from "./NewItemButton.styled";

const NewItemButton = () => {
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
      analyticsContext={"NavBar"}
    />
  );
};

export default NewItemButton;
