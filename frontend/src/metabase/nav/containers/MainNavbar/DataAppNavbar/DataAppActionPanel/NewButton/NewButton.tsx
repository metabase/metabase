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
        title: t`Data`,
        icon: "database",
        action: onAddData,
      },
      {
        title: t`Page`,
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
          <AddIcon name="add" size={14} tooltip={t`Add page`} />
        </IconButtonWrapper>
      }
    />
  );
}

export default NewButton;
