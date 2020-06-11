import React from "react";
import { t } from "ttag";

import Link from "metabase/components/Link";

function WhyReadonly() {
  return (
    <div>
      <p>{t`Once the connection string has been entered and saved, you cannot edit it, since a connection string can contain a password. To update the connection string, delete and re-add the database.`}</p>
    </div>
  );
}

function MongoConnectionStringToggle({ field: { value, onChange } }) {
  return (
    <div>
      <Link className="link" onClick={() => onChange(!value)}>
        {value === false
          ? t`Paste a connection string`
          : t`Fill out individual fields`}
      </Link>
    </div>
  );
}

export default function getFieldsForMongo(details, defaults, id) {
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

  const fields = defaults["details-fields"]
    .filter(
      field =>
        !(
          (useConnectionString && manualFields.includes(field["name"])) ||
          (!useConnectionString && field["name"] === "conn-uri")
        ),
    )
    .map(function(field) {
      if (field["name"] === "conn-uri" && id) {
        // this has been previously saved, so you cannot edit it now
        // to avoid leaking a password
        field.readOnly = true;
        field.type = "password";
      }
      return field;
    });

  return {
    "details-fields": [
      {
        name: "use-connection-uri",
        type: MongoConnectionStringToggle,
        hidden: true,
        default: false,
      },
      ...(id != null && useConnectionString
        ? [
            {
              name: "readonly-info",
              type: WhyReadonly,
            },
          ]
        : []),
      ...fields,
    ],
  };
}
