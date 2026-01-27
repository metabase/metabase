import type { ChangeEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useListDatabaseXraysQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Select } from "metabase/common/components/Select";
import { useSelector } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import { isNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import { getApplicationName } from "metabase/selectors/whitelabel";
import type { Database, DatabaseXray } from "metabase-types/api";

import { HomeCaption } from "../HomeCaption";
import { HomeHelpCard } from "../HomeHelpCard";
import { HomeXrayCard } from "../HomeXrayCard";

import {
  DatabaseLink,
  DatabaseLinkIcon,
  DatabaseLinkText,
  SchemaTrigger,
  SchemaTriggerIcon,
  SchemaTriggerText,
  SectionBody,
} from "./HomeXraySection.styled";

export const HomeXraySection = () => {
  const {
    data: databasesData,
    isLoading: databasesLoading,
    error: databasesError,
  } = useListDatabasesQuery();

  const database = getXrayDatabase(databasesData?.data);
  const candidateListState = useListDatabaseXraysQuery(
    database?.id ?? skipToken,
  );
  const isLoading = databasesLoading || candidateListState.isLoading;
  const error = databasesError ?? candidateListState.error;

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!database) {
    return null;
  }

  return (
    <HomeXrayView database={database} candidates={candidateListState.data} />
  );
};

interface HomeXrayViewProps {
  database: Database;
  candidates?: DatabaseXray[];
}

const HomeXrayView = ({ database, candidates = [] }: HomeXrayViewProps) => {
  const isSample = database.is_sample;
  const schemas = candidates.map((d) => d.schema);
  const [schema, setSchema] = useState(getDefaultSchema(schemas));
  const candidate = candidates.find((d) => d.schema === schema);
  const tableCount = candidate ? candidate.tables.length : 0;
  const tableMessages = useMemo(() => getMessages(tableCount), [tableCount]);
  const canSelectSchema = schemas.length > 1 && schema !== null;
  const applicationName = useSelector(getApplicationName);
  const hasTables = (candidate?.tables.length ?? 0) > 0;

  return (
    <div>
      {isSample ? (
        <HomeCaption primary>
          {t`Try out these sample x-rays to see what ${applicationName} can do.`}
        </HomeCaption>
      ) : canSelectSchema ? (
        <HomeCaption primary>
          {t`Here are some explorations of the`}
          <SchemaSelect
            schema={schema}
            schemas={schemas}
            onChange={setSchema}
          />
          {t`schema in`}
          <DatabaseInfo database={database} />
        </HomeCaption>
      ) : hasTables ? (
        <HomeCaption primary>
          {t`Here are some explorations of`}
          <DatabaseInfo database={database} />
        </HomeCaption>
      ) : null}
      <SectionBody>
        {candidate?.tables.map((table, index) => (
          <HomeXrayCard
            key={table.url}
            title={table.title}
            url={table.url}
            message={tableMessages[index]}
          />
        ))}
        <HomeHelpCard />
      </SectionBody>
    </div>
  );
};

const getDefaultSchema = (schemas: Array<string | null>) => {
  return (
    schemas
      .filter(isNotNull)
      .find((schema) => schema.toLowerCase() === "public") || schemas[0]
  );
};

interface SchemaSelectProps {
  schema: string;
  schemas: string[];
  onChange?: (schema: string) => void;
}

const SchemaSelect = ({ schema, schemas, onChange }: SchemaSelectProps) => {
  const trigger = (
    <SchemaTrigger>
      <SchemaTriggerText data-testid="xray-schema-name">
        {schema}
      </SchemaTriggerText>
      <SchemaTriggerIcon name="chevrondown" />
    </SchemaTrigger>
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onChange?.(event.target.value);
    },
    [onChange],
  );

  return (
    <Select
      value={schema}
      options={schemas}
      optionNameFn={getSchemaOption}
      optionValueFn={getSchemaOption}
      onChange={handleChange}
      triggerElement={trigger}
    />
  );
};

interface DatabaseInfoProps {
  database: Database;
}

const DatabaseInfo = ({ database }: DatabaseInfoProps) => {
  return (
    <DatabaseLink to={Urls.browseDatabase(database)}>
      <DatabaseLinkIcon name="database" />
      <DatabaseLinkText>{database.name}</DatabaseLinkText>
    </DatabaseLink>
  );
};

const getXrayDatabase = (databases: Database[] | undefined = []) => {
  const sampleDatabase = databases.find(
    (d) => d.is_sample && isSyncCompleted(d),
  );
  const userDatabase = databases.find(
    (d) => !d.is_sample && isSyncCompleted(d),
  );
  return userDatabase ?? sampleDatabase;
};

const getMessages = (count: number) => {
  const options = [
    t`A look at`,
    t`A summary of`,
    t`A glance at`,
    t`Some insights about`,
  ];

  return _.chain(count)
    .range()
    .map((index) => options[index % options.length])
    .sample(count)
    .value();
};

const getSchemaOption = (schema: string) => {
  return schema;
};
