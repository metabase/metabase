import { t } from "ttag";

import DefaultEmptyState from "metabase/components/EmptyState";
import type { IconName } from "metabase/ui";

import { EmptyStateContainer } from "./EmptyState.styled";

interface Props {
  message?: string;
  icon?: IconName;
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
