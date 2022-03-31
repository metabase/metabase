import React from "react";
import { t } from "ttag";
import { Database, DatabaseCandidate } from "metabase-types/api";
import {
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

const XraySection = ({ databaseCandidates }: XraySectionProps): JSX.Element => {
  const tables = databaseCandidates.flatMap(d => d.tables);

  return (
    <div>
      <SectionTitle>
        {t`Try out these sample x-rays to see what Metabase can do.`}
      </SectionTitle>
      <XrayList>
        {tables.map(table => (
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
