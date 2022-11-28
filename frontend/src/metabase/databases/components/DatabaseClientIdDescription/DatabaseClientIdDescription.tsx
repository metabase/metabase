import React from "react";
import { useFormikContext } from "formik";
import { jt, t } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";
import { DatabaseData } from "metabase-types/api";

const CREDENTIAL_URLS: Record<string, string> = {
  bigquery:
    "https://console.developers.google.com/apis/credentials/oauthclient",
};

const DatabaseClientIdDescription = (): JSX.Element | null => {
  const { values } = useFormikContext<DatabaseData>();
  const { engine, details } = values;

  if (engine && CREDENTIAL_URLS[engine]) {
    const url = new URL(CREDENTIAL_URLS[engine]);
    const projectId = details["project-id"] ?? "";
    url.searchParams.set("project", String(projectId).trim());

    return (
      <span>
        {jt`${(
          <ExternalLink className="link" href={url.href}>
            {t`Click here`}
          </ExternalLink>
        )} to generate a Client ID and Client Secret for your project.`}{" "}
        {t`Choose "Desktop App" as the application type. Name it whatever you'd like.`}
      </span>
    );
  }

  return null;
};

export default DatabaseClientIdDescription;
