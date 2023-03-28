import { connect } from "react-redux";
import _ from "underscore";

import { push } from "react-router-redux";
import { jt, t } from "ttag";
import React, { useCallback } from "react";
import { getUser } from "metabase/selectors/user";
import Databases from "metabase/entities/databases";
import { Card, DatabaseId, User } from "metabase-types/api";
import { State } from "metabase-types/store";
import { LocationDescriptor } from "metabase-types/types";
import Metabot, { MetabotProps } from "metabase/metabot/components/Metabot";
import DatabasePicker from "metabase/metabot/components/DatabasePicker";
import { MetabotApi } from "metabase/services";
import { getMetabotQuestionResults } from "metabase/metabot/utils/question";
import Database from "metabase-lib/metadata/Database";

interface DatabaseMetabotProps {
  database: Database;
  databases: Database[];
  user?: User;
  initialQuery?: string;
  onDatabaseChange: (databaseId: number) => void;
}

const DatabaseMetabotApp = ({
  database,
  databases,
  user,
  initialQuery,
  onDatabaseChange,
}: DatabaseMetabotProps) => {
  const initialGreeting = getGreetingMessage(
    databases,
    onDatabaseChange,
    database,
    user,
  );

  const handleFetchResults: MetabotProps["onFetchResults"] = useCallback(
    async (prompt: string) => {
      const card = await MetabotApi.databasePrompt({
        databaseId: database.id,
        question: prompt,
      });
      const results = await getMetabotQuestionResults(card, database.metadata);
      return { ...results, prompt };
    },
    [database],
  );

  return (
    <Metabot
      user={user}
      initialGreeting={initialGreeting}
      placeholder={t`Ask something...`}
      initialQuery={initialQuery}
      onFetchResults={handleFetchResults}
    />
  );
};

const getGreetingMessage = (
  databases: Database[],
  onDatabaseChange: (databaseId: number) => void,
  database: Database,
  user?: User,
) => {
  const name = user?.first_name;
  const databasePicker = (
    <DatabasePicker
      databases={databases}
      selectedDatabaseId={database.id}
      onChange={onDatabaseChange}
    />
  );

  return name
    ? jt`What do you want to know about ${databasePicker}, ${name}?`
    : jt`What do you want to know about ${databasePicker}?`;
};

interface RouterParams {
  databaseId?: string;
}

interface CardLoaderProps {
  card: Card;
  params: RouterParams;
  location: LocationDescriptor;
}

interface StateProps {
  user?: User;
  database?: Database;
  initialQuery?: string;
}

const getDatabaseId = (params: RouterParams) => {
  return params.databaseId != null ? parseInt(params.databaseId) : null;
};

const mapStateToProps = (
  state: State,
  { params, location }: CardLoaderProps,
): StateProps => ({
  user: getUser(state) ?? undefined,
  database: Databases.selectors.getObject(state, {
    entityId: getDatabaseId(params),
  }),
  initialQuery: location?.query?.query,
});

const mapDispatchToProps = {
  onDatabaseChange: (databaseId: DatabaseId) =>
    push(`/metabot/database/${databaseId}`),
};

export default _.compose(
  Databases.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(DatabaseMetabotApp);
