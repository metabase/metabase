import React from "react";
import { t } from "ttag";
import DefaultEmptyState from "metabase/components/EmptyState";
import { EmptyStateContainer } from "./EmptyState.styled";

interface Props {
  message?: string;
  icon?: string;
}

function EmptyState({ message = t`Nothing here`, icon = "folder" }: Props) {
  return (
    <EmptyStateContainer>
      <DefaultEmptyState message={message} icon={icon} />
    </EmptyStateContainer>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EmptyState;
