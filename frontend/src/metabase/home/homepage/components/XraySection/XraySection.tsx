import React from "react";
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
  const tableCandidates = databaseCandidates.flatMap(d => d.tables);

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
        {tableCandidates.map(table => (
          <XrayCard key={table.url} url={table.url}>
            <XrayIconContainer>
              <XrayIcon name="bolt" />
            </XrayIconContainer>
            <XrayTitle>
              <XrayTitleSecondary>{t`A look at`}</XrayTitleSecondary>{" "}
              <XrayTitlePrimary>{table.title}</XrayTitlePrimary>
            </XrayTitle>
          </XrayCard>
        ))}
      </XrayList>
    </div>
  );
};

export default XraySection;
