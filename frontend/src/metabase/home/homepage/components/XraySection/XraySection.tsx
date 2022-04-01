import React, { useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import { Database, DatabaseCandidate } from "metabase-types/api";
import {
  DatabaseIcon,
  DatabaseLink,
  DatabaseTitle,
  SectionTitle,
  XrayCard,
  XrayIcon,
  XrayIconContainer,
  XrayList,
  XrayTitle,
  XrayTitlePrimary,
  XrayTitleSecondary,
} from "./XraySection.styled";

export interface XraySectionProps {
  database?: Database;
  databaseCandidates: DatabaseCandidate[];
}

const XraySection = ({
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
          <XrayCard key={table.url} url={table.url}>
            <XrayIconContainer>
              <XrayIcon name="bolt" />
            </XrayIconContainer>
            <XrayTitle>
              <XrayTitleSecondary>{tableMessages[index]}</XrayTitleSecondary>{" "}
              <XrayTitlePrimary>{table.title}</XrayTitlePrimary>
            </XrayTitle>
          </XrayCard>
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

export default XraySection;
