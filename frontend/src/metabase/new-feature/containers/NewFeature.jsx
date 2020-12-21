import React from "react";
import Database from "metabase/entities/databases";

import * as Urls from "metabase/lib/urls";
import Link from "metabase/components/Link";

function NewFeature({ databases }) {
  return (
    <div className="p4">
      <h1>List some databases</h1>
      <ol className="mt2">
        {databases.map(database => (
          <li>
            <Link to={Urls.datamodelDatabase(database.id)} className="link">
              {database.name}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default Database.loadList()(NewFeature);
