import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { hasNativeWritePermissions } from "metabase/common/utils/database";
import { Button, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";

import { useActionDatabases } from "../../hooks/use-action-databases";

export function ActionsHeader() {
  const { databases, isLoading } = useActionDatabases();
  const canCreate = databases.some(hasNativeWritePermissions);

  return (
    <PaneHeader
      data-testid="actions-section-header"
      breadcrumbs={
        <DataStudioBreadcrumbs>{t`Data actions`}</DataStudioBreadcrumbs>
      }
      actions={
        canCreate ? (
          <Button
            component={Link}
            to={Urls.newDataAction()}
            variant="filled"
            leftSection={<Icon name="add" />}
          >
            {t`New action`}
          </Button>
        ) : (
          <Tooltip
            label={t`To create an action, you need permission to write native queries on a database with actions enabled.`}
            disabled={isLoading}
          >
            <Button variant="filled" leftSection={<Icon name="add" />} disabled>
              {t`New action`}
            </Button>
          </Tooltip>
        )
      }
      py={0}
      mb="lg"
    />
  );
}
