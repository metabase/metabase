import type { IconName } from "metabase-types/api";
import { EmptyState } from "metabase/common/components/EmptyState";

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
