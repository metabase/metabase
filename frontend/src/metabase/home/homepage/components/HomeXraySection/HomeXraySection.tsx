import React, { useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import { Database, DatabaseCandidate } from "metabase-types/api";
import HomeXrayCard from "../HomeXrayCard";
import {
  DatabaseIcon,
  DatabaseLink,
  DatabaseTitle,
  SectionTitle,
  XrayList,
} from "./HomeXraySection.styled";

export interface XraySectionProps {
  database?: Database;
  databaseCandidates: DatabaseCandidate[];
}

const HomeXraySection = ({
  database,
  databaseCandidates,
}: XraySectionProps): JSX.Element => {
  const isSample = !database || database.is_sample;
  const tables = databaseCandidates.flatMap(d => d.tables);
  const tableCount = tables.length;
  const tableMessages = useMemo(() => getMessages(tableCount), [tableCount]);

  return (
    <div>
      {isSample ? (
        <SectionTitle>
          {t`Try out these sample x-rays to see what Metabase can do.`}
        </SectionTitle>
      ) : (
        <SectionTitle>
          {t`Here are some explorations of`}
          <DatabaseLink to={Urls.browseDatabase(database)}>
            <DatabaseIcon name="database" />
            <DatabaseTitle>{database.name}</DatabaseTitle>
          </DatabaseLink>
        </SectionTitle>
      )}
      <XrayList>
        {tables.map((table, index) => (
          <HomeXrayCard
            key={table.url}
            title={table.title}
            url={table.url}
            message={tableMessages[index]}
          />
        ))}
      </XrayList>
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
