import React from "react";
import Database from "metabase/entities/databases";

function NewFeature({ databases }) {
  return (
    <div className="p4">
      <h1>List some databases</h1>
      <ol>
        {databases.map(database => (
          <li>{database.name}</li>
        ))}
      </ol>
    </div>
  );
}

export default Database.loadList()(NewFeature);
