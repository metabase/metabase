import EmptyState from "metabase/components/EmptyState";
import type { EmptyStateProps } from "metabase/components/EmptyState/EmptyState";

import { EmptyStateRoot } from "./PermissionsEditorEmptyState.styled";

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
