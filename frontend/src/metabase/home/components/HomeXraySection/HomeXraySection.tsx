import type { ChangeEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useListDatabaseXraysQuery } from "metabase/api";
import { useDatabaseListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Select from "metabase/core/components/Select";
import { useSelector } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import * as Urls from "metabase/lib/urls";
import { getApplicationName } from "metabase/selectors/whitelabel";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseXray } from "metabase-types/api";

import { HomeCaption } from "../HomeCaption";
import { HomeHelpCard } from "../HomeHelpCard";
import { HomeXrayCard } from "../HomeXrayCard";

import {
  DatabaseLinkIcon,
  DatabaseLink,
  DatabaseLinkText,
  SectionBody,
  SchemaTrigger,
  SchemaTriggerText,
  SchemaTriggerIcon,
} from "./HomeXraySection.styled";

export const HomeXraySection = () => {
  const databaseListState = useDatabaseListQuery();
  const database = getXrayDatabase(databaseListState.data);
  const candidateListState = useListDatabaseXraysQuery(
    database?.id ?? skipToken,
  );
  const isLoading = databaseListState.isLoading || candidateListState.isLoading;
  const error = databaseListState.error ?? candidateListState.error;

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
  const schemas = candidates.map(d => d.schema);
  const [schema, setSchema] = useState(schemas[0]);
  const candidate = candidates.find(d => d.schema === schema);
  const tableCount = candidate ? candidate.tables.length : 0;
  const tableMessages = useMemo(() => getMessages(tableCount), [tableCount]);
  const canSelectSchema = schemas.length > 1;
  const applicationName = useSelector(getApplicationName);

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
      ) : (
        <HomeCaption primary>
          {t`Here are some explorations of`}
          <DatabaseInfo database={database} />
        </HomeCaption>
      )}
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

interface SchemaSelectProps {
  schema: string;
  schemas: string[];
  onChange?: (schema: string) => void;
}

const SchemaSelect = ({ schema, schemas, onChange }: SchemaSelectProps) => {
  const trigger = (
    <SchemaTrigger>
      <SchemaTriggerText>{schema}</SchemaTriggerText>
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

const getXrayDatabase = (databases: Database[] = []) => {
  const sampleDatabase = databases.find(d => d.is_sample && isSyncCompleted(d));
  const userDatabase = databases.find(d => !d.is_sample && isSyncCompleted(d));
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
    .map(index => options[index % options.length])
    .sample(count)
    .value();
};

const getSchemaOption = (schema: string) => {
  return schema;
};
