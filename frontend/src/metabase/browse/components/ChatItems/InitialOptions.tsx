import { useMemo, useState } from "react";
import { t } from "ttag";
import { useListDatabaseXraysQuery, skipToken } from "metabase/api";
import { useDatabaseListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { isSyncCompleted } from "metabase/lib/syncing";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseXray } from "metabase-types/api";
import _ from "underscore";
import { HomeXrayCard } from "metabase/home/components/HomeXrayCard";

interface HomeInitialOptionsProps {
  suggestions: any;
  chatType: string;
  onClick?: (message: string) => void;
}

export const HomeInitialOptions = ({ suggestions, chatType, onClick }: HomeInitialOptionsProps) => {
  const databaseListState = useDatabaseListQuery();
  const database = getXrayDatabase(databaseListState.data);
  const candidateListState = useListDatabaseXraysQuery(
    database?.id ?? skipToken,
  );
  const isLoading = databaseListState.isLoading || candidateListState.isLoading;
  const error = databaseListState.error ?? candidateListState.error;

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!database) {
    return null;
  }
  return (
    <HomeInitialOptionsView
      database={database}
      candidates={candidateListState.data}
      suggestions={chatType === 'insights' ? suggestions.insightsSuggestions.slice(0, 2) : suggestions.getDataSuggestions.slice(0, 2)}
      onClick={onClick}
    />
  );
};

interface HomeInitialOptionsViewProps {
  database: Database;
  candidates?: DatabaseXray[];
  suggestions: string[],
  onClick?: (message: string) => void;
}

const HomeInitialOptionsView = ({
  suggestions,
  onClick
}: HomeInitialOptionsViewProps) => {

  return (
    <div
      style={{ display: "flex", gap: "16px", width: "100%", marginTop: "3rem" }}
    >
      {suggestions.map((msg: string, index: number) => (
        <HomeXrayCard
          key={index} // Use index as the key for unique identification
          title={""}
          url={""}
          message={msg}
          onClick={() => onClick?.(msg)} // Pass the specific message when clicked
        />
      ))}
    </div>
  );
};

const getXrayDatabase = (databases: Database[] = []) => {
  const sampleDatabase = databases.find(d => d.is_sample && isSyncCompleted(d));
  const userDatabase = databases.find(d => !d.is_sample && isSyncCompleted(d));
  return userDatabase ?? sampleDatabase;
};
