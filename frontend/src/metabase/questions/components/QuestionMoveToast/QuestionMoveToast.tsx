import React from "react";
import { jt } from "ttag";

import { coerceCollectionId } from "metabase/collections/utils";

import type { CollectionId } from "metabase-types/api";

import {
  CollectionLink,
  StyledIcon,
  ToastRoot,
} from "./QuestionMoveToast.styled";

interface QuestionMoveToastProps {
  isModel: boolean;
  collectionId: CollectionId;
}

function QuestionMoveToast({ isModel, collectionId }: QuestionMoveToastProps) {
  const id = coerceCollectionId(collectionId);
  const collectionLink = <CollectionLink key="collection-link" id={id} />;
  return (
    <ToastRoot>
      <StyledIcon name="collection" />
      {isModel
        ? jt`Model moved to ${collectionLink}`
        : jt`Question moved to ${collectionLink}`}
    </ToastRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionMoveToast;
