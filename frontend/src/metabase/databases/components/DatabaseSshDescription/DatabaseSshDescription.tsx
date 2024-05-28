import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";

const DatabaseSshDescription = (): JSX.Element => {
  // eslint-disable-next-line no-unconditional-metabase-links-render -- Admin settings
  const docsUrl = MetabaseSettings.docsUrl("databases/ssh-tunnel");

  return (
    <>
      {jt`If a direct connection to your database isn't possible, you may want to use an SSH tunnel. ${(
        <ExternalLink key="link" href={docsUrl}>{t`Learn more`}</ExternalLink>
      )}.`}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseSshDescription;
