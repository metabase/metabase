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

export const HomeInitialOptions = () => {
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
    />
  );
};

interface HomeInitialOptionsViewProps {
  database: Database;
  candidates?: DatabaseXray[];
}

const HomeInitialOptionsView = ({
  database,
  candidates = [],
}: HomeInitialOptionsViewProps) => {
  const schemas = candidates.map(d => d.schema);
  const [schema, setSchema] = useState(schemas[0]);
  const candidate = candidates.find(d => d.schema === schema);
  const tableCount = candidate ? candidate.tables.length : 0;
  const tableMessages = useMemo(() => getMessages(tableCount), [tableCount]);

  return (
    <div
      style={{ display: "flex", gap: "16px", width: "100%", marginTop: "3rem" }}
    >
      {candidate?.tables.slice(0, 3).map((table, index) => (
        <HomeXrayCard
          key={table.url}
          title={table.title}
          url={table.url}
          message={tableMessages[index]}
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
