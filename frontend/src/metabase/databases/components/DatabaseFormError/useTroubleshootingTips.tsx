import { createSelector } from "@reduxjs/toolkit";
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router";
import { jt, t } from "ttag";
import { identity } from "underscore";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";
import { Box, Code } from "metabase/ui";
import type { State } from "metabase-types/store";

import type { TipProps } from "./TroubleshootingTip";

export const useTroubleshootingTips = (count?: number): TipProps[] => {
  const applicationName = useSelector(getApplicationName);
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const getDocPageUrl = useSelector(docPageUrlGetter);

  return useMemo(() => {
    const cloudIPLinkContent = renderDocsLinkMaybe(
      t`${applicationName} Cloud IP addresses`,
      getDocPageUrl("cloud/ip-addresses-to-whitelist"),
      showMetabaseLinks,
    );
    const sslCertLinkContent = renderDocsLinkMaybe(
      t`SSL certificate`,
      getDocPageUrl("databases/ssl-certificates"),
      showMetabaseLinks,
    );
    const permissionsLinkContent = renderDocsLinkMaybe(
      t`correct permissions`,
      getDocPageUrl("databases/users-roles-privileges"),
      showMetabaseLinks,
    );

    return [
      {
        title: t`Try allowing ${applicationName} IP addresses`,
        body: (
          <>
            {jt`If the database is behind a firewall or VPN, you may need to allow connections from the ${cloudIPLinkContent}.`}
            <Code display="block" p="0.75rem" mt="sm" component="ul" lh="1rem">
              {metabaseIPAddresses.map((ip) => (
                <li key={ip}>{ip}</li>
              ))}
            </Code>
          </>
        ),
      },
      {
        title: t`Try using a secure connection (SSL)`,
        body: jt`You’ll need an ${sslCertLinkContent} to do this.`,
      },
      {
        title: t`Check ${applicationName} user permissions`,
        body: jt`Check that ${applicationName} has the ${permissionsLinkContent} or user role for your database.`,
      },
      {
        title: t`Double-check connection settings`,
        body: t`Make sure the host name, port or database name don’t contain typos.`,
      },
      {
        title: t`Double-check access credentials`,
        body: t`Is the username and password correct? If possible, copy-paste the values to the form.`,
      },
    ].slice(0, count);
  }, [applicationName, count, getDocPageUrl, showMetabaseLinks]);
};

/**
 * Renders a link to the specified docsUrl if showMetabaseLinks is true. Otherwise, returns the title raw string.
 */
const renderDocsLinkMaybe = (
  title: string,
  docsUrl: string,
  showMetabaseLinks: boolean,
): ReactNode => {
  let linkContent: ReactNode = title;

  if (showMetabaseLinks) {
    linkContent = (
      <Box component={Link} to={docsUrl} fw={600} className={CS.link}>
        {linkContent}
      </Box>
    );
  }

  return linkContent;
};

const docPageUrlGetter = createSelector([identity], (state: State) => {
  return (page: string): string => getDocsUrl(state, { page });
});

const metabaseIPAddresses = ["18.207.81.126", "3.211.20.157", "50.17.234.169"];
