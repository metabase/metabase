import React from "react";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Database } from "metabase-types/api";
import XraySection from "../../containers/XraySection";

export interface HomeContentProps {
  databases: Database[];
}

const HomeContent = ({ databases }: HomeContentProps): JSX.Element | null => {
  if (databases.some(isSyncCompleted)) {
    return <XraySection />;
  } else {
    return null;
  }
};

export default HomeContent;
