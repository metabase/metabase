import { Link } from "react-router";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Box, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";

export function PageHeader() {
  return (
    <Box>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>
            <Link to={Urls.transformList()}>{t`Transforms`}</Link>
            {t`Migrate models`}
          </DataStudioBreadcrumbs>
        }
      />
      <Title order={2} mb="sm">{t`Convert your models to transforms`}</Title>
      <Text maw="38rem" mb="xl">
        {t`Transforms create tables in your database or data warehouse, regularly refreshing the data on a schedule. We'll be gradually phasing out models in favor of transforms because they and the tables they create are more reliable and extensible.`}
      </Text>
      <Title order={4}>{t`Pick a model to convert`}</Title>
    </Box>
  );
}
