import React from "react";
import { t } from "ttag";
import {
  EmptyStateDescription,
  EmptyStateRoot,
  EmptyStateTitle,
} from "./CollectionEmptyState.styled";
import Button from "metabase/core/components/Button";

const CollectionEmptyState = (): JSX.Element => {
  return (
    <EmptyStateRoot>
      <EmptyStateTitle>{t`This collection is empty`}</EmptyStateTitle>
      <EmptyStateDescription>{t`Use collections to organize and group dashboards and questions for your team or yourself`}</EmptyStateDescription>
      <Button icon="add">{t`Create a new…`}</Button>
    </EmptyStateRoot>
  );
};

export default CollectionEmptyState;
