import React, { Fragment } from "react";
import { User, Database } from "../../types";
import DatabaseStatusSmall from "../DatabaseStatusSmall";

interface Props {
  user?: User;
  databases?: Database[];
}

const DatabaseStatusListing = ({ user, databases = [] }: Props) => {
  const userDatabases = databases.filter(d => d.creator_id === user?.id);

  return (
    <Fragment>
      {userDatabases.map(database => (
        <DatabaseStatusSmall key={database.id} database={database} />
      ))}
    </Fragment>
  );
};

export default DatabaseStatusListing;
