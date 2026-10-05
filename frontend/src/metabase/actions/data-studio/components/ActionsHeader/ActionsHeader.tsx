import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { Button, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";

export function ActionsHeader() {
  return (
    <PaneHeader
      data-testid="actions-section-header"
      breadcrumbs={
        <DataStudioBreadcrumbs>{t`Data actions`}</DataStudioBreadcrumbs>
      }
      actions={
        <Button
          component={Link}
          to={Urls.newDataAction()}
          variant="filled"
          leftSection={<Icon name="add" />}
        >
          {t`New action`}
        </Button>
      }
      py={0}
      mb="lg"
    />
  );
}
