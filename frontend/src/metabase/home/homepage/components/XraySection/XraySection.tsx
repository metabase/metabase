import React from "react";
import { t } from "ttag";
import { Database, DatabaseCandidate } from "metabase-types/api";
import { SectionTitle } from "./XraySection.styled";

export interface XraySectionProps {
  database?: Database;
  candidates: DatabaseCandidate[];
}

const XraySection = ({
  database,
  candidates,
}: XraySectionProps): JSX.Element => {
  return (
    <div>
      <SectionTitle>
        {t`Try out these sample x-rays to see what Metabase can do.`}
      </SectionTitle>
    </div>
  );
};

export default XraySection;
