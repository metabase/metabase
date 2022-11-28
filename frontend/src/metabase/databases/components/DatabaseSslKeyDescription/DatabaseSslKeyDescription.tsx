import React from "react";
import { useFormikContext } from "formik";
import { jt, t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import { DatabaseValues } from "../../types";

const DatabaseSslKeyDescription = (): JSX.Element | null => {
  const { values } = useFormikContext<DatabaseValues>();
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

export default DatabaseSslKeyDescription;
