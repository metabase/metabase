import React, { useMemo, useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import { Database, DatabaseCandidate } from "metabase-types/api";
import HomeCaption from "../HomeCaption";
import HomeXrayCard from "../HomeXrayCard";
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
  database?: Database;
  candidates: DatabaseCandidate[];
}

const HomeXraySection = ({
  database,
  candidates,
}: HomeXraySectionProps): JSX.Element => {
  const isSample = !database || database.is_sample;
  const schemas = candidates.map(d => d.schema);
  const [schema] = useState(schemas[0]);
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
          <SchemaTrigger>
            <SchemaTriggerText>{schema}</SchemaTriggerText>
            <SchemaTriggerIcon name="chevrondown" />
          </SchemaTrigger>
          {t`schema in`}
          <DatabaseLink to={Urls.browseDatabase(database)}>
            <DatabaseLinkIcon name="database" />
            <DatabaseLinkText>{database.name}</DatabaseLinkText>
          </DatabaseLink>
        </HomeCaption>
      ) : (
        <HomeCaption primary>
          {t`Here are some explorations of`}
          <DatabaseLink to={Urls.browseDatabase(database)}>
            <DatabaseLinkIcon name="database" />
            <DatabaseLinkText>{database.name}</DatabaseLinkText>
          </DatabaseLink>
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
      </SectionBody>
    </div>
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

export default HomeXraySection;
