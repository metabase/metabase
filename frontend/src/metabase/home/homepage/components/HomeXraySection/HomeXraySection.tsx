import React, { useMemo, useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import { Database, DatabaseCandidate } from "metabase-types/api";
import HomeCaption from "../HomeCaption";
import HomeXrayCard from "../HomeXrayCard";
import {
  DatabaseIcon,
  DatabaseLink,
  DatabaseTitle,
  SectionBody,
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
  const [schema, setSchema] = useState(schemas[0]);
  const candidate = candidates.find(d => d.schema === schema);
  const tableCount = candidate ? candidate.tables.length : 0;
  const tableMessages = useMemo(() => getMessages(tableCount), [tableCount]);

  return (
    <div>
      {isSample ? (
        <HomeCaption primary>
          {t`Try out these sample x-rays to see what Metabase can do.`}
        </HomeCaption>
      ) : (
        <HomeCaption primary>
          {t`Here are some explorations of`}
          <DatabaseLink to={Urls.browseDatabase(database)}>
            <DatabaseIcon name="database" />
            <DatabaseTitle>{database.name}</DatabaseTitle>
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
