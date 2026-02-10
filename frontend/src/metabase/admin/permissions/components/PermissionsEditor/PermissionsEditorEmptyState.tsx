import { EmptyState } from "metabase/common/components/EmptyState";
import type { IconName } from "metabase/ui";

import S from "./PermissionsEditorEmptyState.module.css";

interface PermissionsEditorEmptyStateProps {
  icon: IconName;
  message: string;
}

export const PermissionsEditorEmptyState = (
  props: PermissionsEditorEmptyStateProps,
) => (
  <div className={S.EmptyStateRoot}>
    <EmptyState {...props} />
  </div>
);
