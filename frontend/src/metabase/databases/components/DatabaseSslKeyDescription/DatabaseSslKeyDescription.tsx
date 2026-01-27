import { useFormikContext } from "formik";
import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import type { DatabaseData } from "metabase-types/api";

const DatabaseSslKeyDescription = (): JSX.Element | null => {
  const { values } = useFormikContext<DatabaseData>();
  const { engine } = values;

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Admin settings
  const { url: docsUrl } = useDocsUrl("databases/connections/postgresql", {
    anchor: "authenticate-client-certificate",
  });

  if (engine !== "postgres") {
    return null;
  }

  return (
    <>
      {jt`If you have a PEM SSL client key, you can convert that key to the PKCS-8/DER format using OpenSSL. ${(
        <ExternalLink key="link" href={docsUrl}>{t`Learn more`}</ExternalLink>
      )}.`}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseSslKeyDescription;
