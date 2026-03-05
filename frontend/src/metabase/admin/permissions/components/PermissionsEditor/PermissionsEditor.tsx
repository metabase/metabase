import { UpsellPermissions } from "metabase/admin/upsells";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box } from "metabase/ui";

import S from "./PermissionsEditor.module.css";
import {
  PermissionsEditorContent,
  type PermissionsEditorContentProps,
} from "./PermissionsEditorContent";

interface PermissionsEditorProps extends PermissionsEditorContentProps {
  isLoading?: boolean;
  error?: string;
}

export const PermissionsEditor = ({
  isLoading,
  error,
  ...contentProps
}: PermissionsEditorProps) => {
  return (
    <div className={S.PermissionsEditorRoot}>
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        <>
          <Box mx="xl" mb="md">
            <UpsellPermissions location="settings-permissions" />
          </Box>
          <PermissionsEditorContent {...contentProps} />
        </>
      </LoadingAndErrorWrapper>
    </div>
  );
};
