import { createSelector } from "@reduxjs/toolkit";
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";
import { identity } from "underscore";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Box, Code } from "metabase/ui";
import type { State } from "metabase-types/store";

import type { TipProps as _TipProps } from "./TroubleshootingTip";

type TipKey =
  | "ip-addresses"
  | "ssl"
  | "permissions"
  | "connection-settings"
  | "credentials";
type TipProps = _TipProps & { key: TipKey };

export const useTroubleshootingTips = (
  isHostAndPortError: boolean,
  expanded: boolean,
): TipProps[] => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const getDocPageUrl = useSelector(docPageUrlGetter);

  return useMemo(() => {
    if (isHostAndPortError && !expanded) {
      return [];
    }

    const cloudIPLinkContent = renderDocsLinkMaybe(
      // eslint-disable-next-line no-literal-metabase-strings -- Only visible to admins
      t`Metabase Cloud IP addresses`,
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
        key: "ip-addresses" as const,
        // eslint-disable-next-line no-literal-metabase-strings -- Only visible to admins
        title: t`Try allowing Metabase IP addresses`,
        body: (
          <>
            {
              // eslint-disable-next-line no-literal-metabase-strings -- Only visible to admins
              c("{0} refers to 'Metabase Cloud IP addresses'")
                .jt`If the database is behind a firewall or VPN, you may need to allow connections from the ${cloudIPLinkContent}.`
            }
            <Code display="block" p="0.75rem" mt="sm" component="ul" lh="1rem">
              {metabaseIPAddresses.map((ip) => (
                <li key={ip}>{ip}</li>
              ))}
            </Code>
          </>
        ),
      },
      {
        key: "ssl" as const,
        title: t`Try using a secure connection (SSL)`,
        body: c("{0} refers to 'SSL certificate'")
          .jt`You’ll need an ${sslCertLinkContent} to do this.`,
      },
      {
        key: "permissions" as const,
        // eslint-disable-next-line no-literal-metabase-strings -- Only visible to admins
        title: t`Check Metabase user permissions`,
        body: // eslint-disable-next-line no-literal-metabase-strings -- Only visible to admins
        c("{0} refers to 'correct permissions'")
          .jt`Check that Metabase has the ${permissionsLinkContent} or user role for your database.`,
      },
      {
        key: "connection-settings" as const,
        title: t`Double-check connection settings`,
        body: t`Make sure the host name, port or database name don’t contain typos.`,
      },
      {
        key: "credentials" as const,
        title: t`Double-check access credentials`,
        body: t`Is the username and password correct? If possible, copy-paste the values to the form.`,
      },
    ].filter((tip) => {
      const initialTips: TipKey[] = ["ip-addresses", "ssl"];
      return expanded || initialTips.includes(tip.key);
    });
  }, [expanded, getDocPageUrl, showMetabaseLinks, isHostAndPortError]);
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
      <Box
        className={CS.link}
        component={Link}
        fw={600}
        key={docsUrl}
        to={docsUrl}
      >
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
