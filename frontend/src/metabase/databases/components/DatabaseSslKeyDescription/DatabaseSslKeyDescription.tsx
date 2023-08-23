import { useFormikContext } from "formik";
import { jt, t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import type { DatabaseData } from "metabase-types/api";

const DatabaseSslKeyDescription = (): JSX.Element | null => {
  const { values } = useFormikContext<DatabaseData>();
  const { engine } = values;

  if (engine !== "postgres") {
    return null;
  }

  const docsUrl = MetabaseSettings.docsUrl(
    "databases/connections/postgresql",
    "authenticate-client-certificate",
  );

  return (
    <>
      {jt`If you have a PEM SSL client key, you can convert that key to the PKCS-8/DER format using OpenSSL. ${(
        <ExternalLink href={docsUrl}>{t`Learn more`}</ExternalLink>
      )}.`}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseSslKeyDescription;
