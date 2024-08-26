import { useFormikContext } from "formik";
import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import type { DatabaseData } from "metabase-types/api";

const CREDENTIAL_URLS: Record<string, string> = {
  bigquery:
    "https://console.developers.google.com/apis/credentials/oauthclient",
};

const DatabaseClientIdDescription = (): JSX.Element | null => {
  const { values } = useFormikContext<DatabaseData>();
  const { engine, details } = values;

  if (!engine || !CREDENTIAL_URLS[engine]) {
    return null;
  }

  const projectId = details["project-id"] ?? "";
  const projectUrl = new URL(CREDENTIAL_URLS[engine]);
  projectUrl.searchParams.set("project", String(projectId));

  return (
    <span>
      {jt`${(
        <ExternalLink className={CS.link} href={projectUrl.href}>
          {t`Click here`}
        </ExternalLink>
      )} to generate a Client ID and Client Secret for your project.`}{" "}
      {t`Choose "Desktop App" as the application type. Name it whatever you'd like.`}
    </span>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseClientIdDescription;
