import React from "react";
import { jt } from "ttag";

import Collections from "metabase/entities/collections";
import { color } from "metabase/lib/colors";

import { StyledIcon, ToastRoot } from "./QuestionMoveToast.styled";

interface QuestionMoveToastProps {
  isModel: boolean;
  collectionId: number;
}

export default function QuestionMoveToast({
  isModel,
  collectionId,
}: QuestionMoveToastProps) {
  return (
    <ToastRoot>
      <StyledIcon name="all" color="white" />
      {isModel
        ? jt`Model moved to ${(
            <Collections.Link
              key="collection-link"
              id={collectionId}
              ml={1}
              color={color("brand")}
            />
          )}`
        : jt`Question moved to ${(
            <Collections.Link
              key="collection-link"
              id={collectionId}
              ml={1}
              color={color("brand")}
            />
          )}`}
    </ToastRoot>
  );
}
