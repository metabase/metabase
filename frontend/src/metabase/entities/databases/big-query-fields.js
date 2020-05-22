import React from "react";
import { t, jt } from "ttag";

import { color } from "metabase/lib/colors";
import ExternalLink from "metabase/components/ExternalLink";
import Link from "metabase/components/Link";

const SERVICE_ACCOUNT_DOCS_URL =
  "https://developers.google.com/identity/protocols/OAuth2ServiceAccount";
function BigQueryServiceAccountToggle({
  field: { value, onChange },
  values: { details },
}) {
  const saLink = (
    <ExternalLink
      href={SERVICE_ACCOUNT_DOCS_URL}
    >{t`Service Accounts`}</ExternalLink>
  );

  const hasNoOldStyleData = ["client-id", "client-secret"].every(
    key => details[key] == null,
  );

  return (!value && hasNoOldStyleData) || value === true ? (
    <div>
      <p>{jt`Metabase connects to Big Query via ${saLink}.`}</p>
      {value === true && (
        <Link className="link" onClick={() => onChange(false)}>
          {t`Continue using an OAuth application to connect`}
        </Link>
      )}
    </div>
  ) : (
    <div
      style={{
        borderLeftWidth: 3,
        borderLeftStyle: "solid",
        borderLeftColor: color("brand"),
      }}
      className="pl1"
    >
      <p>
        {jt`We recommend switching to use ${saLink} instead of an OAuth application to connect to BigQuery`}
      </p>
      <Link
        className="link"
        onClick={() => onChange(true)}
      >{t`Connect to a Service Account instead`}</Link>
    </div>
  );
}

export default function getFieldsForBigQuery(details) {
  const useServiceAccount =
    // If this field is unset, show the service account form unless an old-style connection exists.
    details["use-service-account"] == null
      ? ["client-id", "client-secret"].every(key => details[key] == null)
      : details["use-service-account"];
  return {
    "details-fields": [
      {
        name: "use-service-account",
        type: BigQueryServiceAccountToggle,
        hidden: true,
      },
      ...(useServiceAccount
        ? []
        : [
            {
              name: "project-id",
              "display-name": "Project ID",
              placeholder: "praxis-beacon-120871",
              required: true,
            },
          ]),
      {
        name: "dataset-id",
        "display-name": "Dataset ID",
        placeholder: "toucanSightings",
        required: true,
      },
      ...(useServiceAccount
        ? [
            {
              name: "service-account-json",
              "display-name": "Service account JSON file",
              type: "textFile",
              required: true,
            },
          ]
        : [
            {
              name: "client-id",
              "display-name": "Client ID",
              placeholder:
                "1201327674725-y6ferb0feo1hfssr7t40o4aikqll46d4.apps.googleusercontent.com",
              required: true,
            },
            {
              name: "client-secret",
              "display-name": "Client Secret",
              placeholder: "dJNi4utWgMzyIFo2JbnsK6Np",
              required: true,
            },
            {
              name: "auth-code",
              "display-name": "Auth Code",
              placeholder: "4/HSk-KtxkSzTt61j5zcbee2Rmm5JHkRFbL5gD5lgkXek",
              required: true,
            },
          ]),
      {
        name: "use-jvm-timezone",
        "display-name": "Use JVM Time Zone",
        default: false,
        type: "boolean",
      },
    ],
  };
}
