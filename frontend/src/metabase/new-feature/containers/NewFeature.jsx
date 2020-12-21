import React from "react";
import Database from "metabase/entities/databases";

function NewFeature({ databases }) {
  return (
    <ol>
      {databases.map(database => (
        <li>{database.name}</li>
      ))}
    </ol>
  );
}

export default Database.loadList()(NewFeature);
