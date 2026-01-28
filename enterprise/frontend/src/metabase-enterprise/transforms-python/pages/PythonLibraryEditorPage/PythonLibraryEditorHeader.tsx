import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import * as Urls from "metabase/lib/urls";
import { Button, Group } from "metabase/ui";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";

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
    <PaneHeader
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
