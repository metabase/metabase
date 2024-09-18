import EmptyState from "metabase/components/EmptyState";

import { EmptyStateRoot } from "./PermissionsEditorEmptyState.styled";
import { EmptyStateProps } from "metabase/components/EmptyState/EmptyState";

interface PermissionsEditorEmptyStateProps extends EmptyStateProps {
  icon: Exclude<EmptyStateProps["icon"], undefined>;
  message: Exclude<EmptyStateProps["message"], undefined>;
}

export const PermissionsEditorEmptyState = (
  props: PermissionsEditorEmptyStateProps,
) => (
  <EmptyStateRoot>
    <EmptyState {...props} />
  </EmptyStateRoot>
);
