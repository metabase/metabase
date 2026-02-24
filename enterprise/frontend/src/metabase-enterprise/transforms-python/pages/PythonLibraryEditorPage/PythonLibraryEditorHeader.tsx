import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/lib/urls";
import { Button, Group } from "metabase/ui";

type PythonLibraryEditorHeaderProps = {
  typeDisplayName: string;
  isDirty?: boolean;
  isSaving?: boolean;
  onSave: () => void;
  onRevert: () => void;
};

export const PythonLibraryEditorHeader = ({
  typeDisplayName,
  isDirty,
  isSaving,
  onSave,
  onRevert,
}: PythonLibraryEditorHeaderProps) => {
  return (
    <PaneHeader
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link to={Urls.transformList()}>{t`Transforms`}</Link>
          {typeDisplayName + " " + t`library`}
        </DataStudioBreadcrumbs>
      }
      title={
        <PanelHeaderTitle>
          {typeDisplayName + " " + t`library`}
        </PanelHeaderTitle>
      }
      actions={
        (isDirty || isSaving) && (
          <Group wrap="nowrap">
            <Button disabled={isSaving} onClick={onRevert}>
              {t`Revert`}
            </Button>
            <Button variant="filled" disabled={isSaving} onClick={onSave}>
              {t`Save`}
            </Button>
          </Group>
        )
      }
      data-testid="python-library-header"
    />
  );
};
