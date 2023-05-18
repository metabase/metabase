import React from "react";
import { t } from "ttag";

import {
  PopoverBody,
  StyledList,
  StyledListItem,
  StyledDiv,
} from "./TextChoicesPopover.styled";

interface TextChoicesPopoverProps {
  onAddMarkdown: () => void;
  onAddHeading: () => void;
  onClose: () => void;
}

export function TextChoicesPopover({
  onAddMarkdown,
  onAddHeading,
  onClose,
}: TextChoicesPopoverProps) {
  const addHeading = () => {
    onAddHeading();
    onClose();
  };

  const addMarkdown = () => {
    onAddMarkdown();
    onClose();
  };

  return (
    <PopoverBody>
      <StyledList>
        <TextOptionItem
          key="heading"
          option={t`Heading`}
          onClick={addHeading}
        />
        <TextOptionItem key="text" option={t`Text`} onClick={addMarkdown} />
      </StyledList>
    </PopoverBody>
  );
}

interface TextOptionItemProps {
  option: string;
  onClick: () => void;
}

const TextOptionItem = ({ option, onClick }: TextOptionItemProps) => (
  <StyledListItem onClick={onClick}>
    <StyledDiv>{option}</StyledDiv>
  </StyledListItem>
);
