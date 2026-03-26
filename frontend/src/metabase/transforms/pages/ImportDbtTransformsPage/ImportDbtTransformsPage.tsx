import { CodeEditor } from "metabase/common/components/CodeEditor";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import { Link, type Route } from "react-router";
import { t } from "ttag";

import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useImportDbtTransformsMutation } from "metabase/api";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { Center, Flex } from "metabase/ui";
import type { Database, DraftTransformSource } from "metabase-types/api";

import { doesDatabaseSupportTransforms } from "../../utils";

type ImportDbtTransformsPageProps = {
  initialSource: DraftTransformSource;
  route: Route;
};

export function ImportDbtTransformsPage({
  route,
}: ImportDbtTransformsPageProps) {
  const {
    transformsDatabases,
    isLoadingDatabases: isLoading,
    databasesError: error,
  } = useTransformPermissions();
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  if (isLoading || error != null || transformsDatabases == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (isRemoteSyncReadOnly) {
    return (
      <PageContainer pos="relative" data-testid="transform-query-editor">
        <PaneHeader
          breadcrumbs={
            <DataStudioBreadcrumbs>
              <Link key="transform-list" to={Urls.transformList()}>
                {t`Transforms`}
              </Link>
            </DataStudioBreadcrumbs>
          }
        />
        <NotFound />
      </PageContainer>
    );
  }

  return (
    <ImportDbtTransformsPageBody
      databases={transformsDatabases}
      route={route}
    />
  );
}

type ImportDbtTransformsPageBodyProps = {
  databases: Database[];
  route: Route;
};

interface DbtToMetabaseConfigFormData {
  config: {
    dbt: {
      target: string;
    };
    metabase: { database_id: number };
  };
  manifest: string;
}

function ImportDbtTransformsPageBody({
  databases,
}: ImportDbtTransformsPageBodyProps) {
  const [importDbtTransforms] = useImportDbtTransformsMutation();

  const handleSubmit = ({ manifest, config }: DbtToMetabaseConfigFormData) => {
    console.log("values.manifest", manifest);
    const body = { config, manifest: JSON.parse(manifest) };
    console.log("handleSubmit -> body", body);
    return importDbtTransforms(body).unwrap();
  };

  return (
    <PageContainer pos="relative" data-testid="import-dbt-transforms">
      <PaneHeader
        title={t`Import transforms`}
        breadcrumbs={
          <DataStudioBreadcrumbs>
            <Link key="transform-list" to={Urls.transformList()}>
              {t`Transforms`}
            </Link>
            {t`Import transforms`}
          </DataStudioBreadcrumbs>
        }
        showMetabotButton
      />
      <FormProvider<DbtToMetabaseConfigFormData>
        initialValues={{
          config: {
            dbt: {
              target: "",
            },
            metabase: {
              database_id: 0,
            },
          },
          manifest: "",
        }}
        enableReinitialize
        onSubmit={handleSubmit}
      >
        {({
          dirty,
          values: {
            config: {
              metabase: { database_id },
            },
            manifest,
          },
          setFieldValue,
        }) => (
          <Form disabled={!dirty}>
            <Flex
              h="3rem"
              ml="sm"
              align="center"
              data-testid="selected-database"
            >
              <DatabaseDataSelector
                selectedDatabaseId={database_id}
                setDatabaseFn={async (value: string | null) => {
                  const new_database_id = value ? parseInt(value) : undefined;
                  if (
                    new_database_id != null &&
                    new_database_id !== database_id
                  ) {
                    await setFieldValue("config.metabase.database_id", value);
                  }
                }}
                databases={databases}
                databaseIsDisabled={(database: Database) =>
                  !doesDatabaseSupportTransforms(database)
                }
              />
            </Flex>
            <FormTextInput
              name="config.dbt.target"
              label={t`DBT Target`}
              placeholder={t`prod`}
            />
            <CodeEditor
              value={manifest}
              onChange={(value) => setFieldValue("manifest", value)}
              language="json"
            />
            <FormSubmitButton label="Import" />
            <FormErrorMessage />
          </Form>
        )}
      </FormProvider>
    </PageContainer>
  );
}
