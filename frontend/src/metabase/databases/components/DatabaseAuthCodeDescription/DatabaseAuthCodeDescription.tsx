import { useFormikContext } from "formik";
import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import type { DatabaseData } from "metabase-types/api";

const AUTH_CODE_URLS: Record<string, string> = {
  bigquery:
    "https://accounts.google.com/o/oauth2/auth?redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/bigquery",
  bigquery_with_drive:
    "https://accounts.google.com/o/oauth2/auth?redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/bigquery%20https://www.googleapis.com/auth/drive",
};

const DatabaseAuthCodeDescription = (): JSX.Element | null => {
  const { values } = useFormikContext<DatabaseData>();
  const { engine, details } = values;

  if (!engine || !AUTH_CODE_URLS[engine]) {
    return null;
  }

  const clientId = details["client-id"] ?? "";
  const authCodeUrl = new URL(AUTH_CODE_URLS[engine]);
  const googleDriveUrl = new URL(AUTH_CODE_URLS["bigquery_with_drive"]);
  authCodeUrl.searchParams.set("client_id", String(clientId));
  googleDriveUrl.searchParams.set("client_id", String(clientId));

  return (
    <span>
      {jt`${(
        <ExternalLink href={authCodeUrl.href}>{t`Click here`}</ExternalLink>
      )} to get an auth code.`}
      {engine === "bigquery" && (
        <span>
          {" "}
          ({t`or`}{" "}
          <ExternalLink href={googleDriveUrl.href}>
            {t`with Google Drive permissions`}
          </ExternalLink>
          )
        </span>
      )}
    </span>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseAuthCodeDescription;
