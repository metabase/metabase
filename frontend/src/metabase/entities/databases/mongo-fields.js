import React from "react";
import { t } from "ttag";

import Link from "metabase/components/Link";

function MongoConnectionStringToggle({
  field: { value, onChange },
  values: { details },
}) {
  return value === false ? (
    <div>
      <Link className="link" onClick={() => onChange(true)}>
        {t`Paste a connection string`}
      </Link>
    </div>
  ) : (
    <div>
      <Link className="link" onClick={() => onChange(false)}>
        {t`Fill out individual fields`}
      </Link>
    </div>
  );
}

export default function getFieldsForMongo(details, defaults) {
  const useConnectionString =
    details["use-connection-uri"] == null || details["use-connection-uri"];

  const manualFields = [
    "host",
    "dbname",
    "port",
    "user",
    "pass",
    "authdb",
    "additional-options",
    "use-srv",
    "ssl",
  ];

  const fields = [];
  for (const field of defaults["details-fields"]) {
    if (
      (useConnectionString && manualFields.includes(field["name"])) ||
      (!useConnectionString && field["name"] === "conn-uri")
    ) {
      continue;
    } else {
      // in the case that we're adding the conn-uri field, it becomes required
      if (field["name"] === "conn-uri") {
        field.required = true;
      }

      fields.push(field);
    }
  }

  return {
    "details-fields": [
      {
        name: "use-connection-uri",
        type: MongoConnectionStringToggle,
        hidden: true,
        default: false,
      },
      ...fields,
    ],
  };
}
