import React, { useMemo } from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

import { AddIcon } from "./NewButton.styled";

interface NewButtonProps {
  onAddData: () => void;
  onNewPage: () => void;
}

function NewButton({ onAddData, onNewPage }: NewButtonProps) {
  const menuItems = useMemo(
    () => [
      {
        title: t`Page with data`,
        icon: "database",
        action: onAddData,
      },
      {
        title: t`Blank page`,
        icon: "pencil",
        action: onNewPage,
      },
    ],
    [onAddData, onNewPage],
  );

  return (
    <EntityMenu
      items={menuItems}
      trigger={
        <IconButtonWrapper>
          <AddIcon name="add" size={14} tooltip={t`Add a page`} />
        </IconButtonWrapper>
      }
    />
  );
}

export default NewButton;
