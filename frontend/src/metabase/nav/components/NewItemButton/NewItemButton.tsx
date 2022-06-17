import React from "react";
import { t } from "ttag";
import NewItemMenu from "metabase/nav/containers/NewItemMenu";
import { ButtonRoot, ButtonText } from "./NewItemButton.styled";

const NewItemButton = () => {
  return (
    <NewItemMenu>
      <ButtonRoot
        primary
        icon="add"
        iconSize={14}
        data-metabase-event="NavBar;Create Menu Click"
      >
        <ButtonText>{t`New`}</ButtonText>
      </ButtonRoot>
    </NewItemMenu>
  );
};

export default NewItemButton;
