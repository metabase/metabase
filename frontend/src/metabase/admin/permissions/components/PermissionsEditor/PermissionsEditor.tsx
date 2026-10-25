import { UpsellPermissions } from "metabase/admin/upsells";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type {
  PermissionSectionBase,
  PermissionSectionConfig,
} from "metabase/permissions";
import { Box } from "metabase/ui";

import S from "./PermissionsEditor.module.css";
import {
  PermissionsEditorContent,
  type PermissionsEditorContentProps,
} from "./PermissionsEditorContent";

type PermissionsEditorProps<TSection extends PermissionSectionBase> =
  PermissionsEditorContentProps<TSection> & {
    isLoading?: boolean;
    error?: string;
  };

export const PermissionsEditor = <
  TSection extends PermissionSectionBase = PermissionSectionConfig,
>({
  isLoading,
  error,
  ...contentProps
}: PermissionsEditorProps<TSection>) => {
  return (
    <div className={S.PermissionsEditorRoot}>
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        <>
          <Box mx="xxl" mb="lg">
            <UpsellPermissions location="settings-permissions" />
          </Box>
          <PermissionsEditorContent {...contentProps} />
        </>
      </LoadingAndErrorWrapper>
    </div>
  );
};
