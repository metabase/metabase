import React from "react";
import { Database, DatabaseCandidate } from "metabase-types/api";

export interface XraySectionProps {
  database?: Database;
  candidates: DatabaseCandidate[];
}

const XraySection = ({
  database,
  candidates,
}: XraySectionProps): JSX.Element => {
  return <div />;
};

export default XraySection;
