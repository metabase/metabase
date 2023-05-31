import React, { ChangeEvent, useCallback, useMemo, useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Select from "metabase/core/components/Select";
import { DatabaseCandidate } from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";
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

export interface HomeXraySectionProps {
  database: Database;
  candidates: DatabaseCandidate[];
}

const HomeXraySection = ({
  database,
  candidates,
}: HomeXraySectionProps): JSX.Element => {
  const isSample = database.is_sample;
  const schemas = candidates.map(d => d.schema);
  const [schema, setSchema] = useState(schemas[0]);
  const candidate = candidates.find(d => d.schema === schema);
  const tableCount = candidate ? candidate.tables.length : 0;
  const tableMessages = useMemo(() => getMessages(tableCount), [tableCount]);
  const canSelectSchema = schemas.length > 1;

  return (
    <div>
      {isSample ? (
        <HomeCaption primary>
          {t`Try out these sample x-rays to see what Metabase can do.`}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HomeXraySection;
