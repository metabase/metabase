import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import { ClickableRoot } from "./DataAppEditPageButton.styled";

interface DataAppEditPageButtonProps {
  onClick: () => void;
}

function DataAppEditPageButton({ onClick }: DataAppEditPageButtonProps) {
  return (
    <ClickableRoot onClick={onClick}>
      <Icon name="pencil" tooltip={t`Edit page`} />
    </ClickableRoot>
  );
}

export default DataAppEditPageButton;
