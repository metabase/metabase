import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PanelHeaderTitle } from "metabase/common/data-studio/components/PaneHeader";
import { DataStudioPaneHeader } from "metabase/data-studio/app/components/DataStudioPaneHeader";
import { Button, Group } from "metabase/ui";
import * as Urls from "metabase/urls";

type PythonLibraryEditorHeaderProps = {
  isDirty?: boolean;
  isSaving?: boolean;
  onSave: () => void;
  onRevert: () => void;
};

export const PythonLibraryEditorHeader = ({
  isDirty,
  isSaving,
  onSave,
  onRevert,
}: PythonLibraryEditorHeaderProps) => {
  return (
    <DataStudioPaneHeader
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link to={Urls.transformList()}>{t`Transforms`}</Link>
          {t`Python library`}
        </DataStudioBreadcrumbs>
      }
      title={<PanelHeaderTitle>{t`Python library`}</PanelHeaderTitle>}
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
