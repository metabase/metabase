import { createSelector } from "@reduxjs/toolkit";
import { useMemo } from "react";
import { c, t } from "ttag";
import { identity } from "underscore";

import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { getIsHosted } from "metabase/setup";
import { Code } from "metabase/ui";
import type { State } from "metabase-types/store";

import type { TipProps as _TipProps } from "./TroubleshootingTip";
import { getDocsLinkConditionally, useCloudGatewayIPs } from "./utils";

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
  const isHosted = useSelector(getIsHosted);
  const getDocPageUrl = useSelector(docPageUrlGetter);
  const metabaseIPAddresses = useCloudGatewayIPs();

  return useMemo(() => {
    if (isHostAndPortError && !expanded) {
      return [];
    }

    const cloudIPLinkContent = getDocsLinkConditionally(
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- Only visible to admins
      t`Metabase Cloud IP addresses`,
      getDocPageUrl("cloud/ip-addresses-to-whitelist"),
      showMetabaseLinks,
    );
    const sslCertLinkContent = getDocsLinkConditionally(
      t`SSL certificate`,
      getDocPageUrl("databases/ssl-certificates"),
      showMetabaseLinks,
    );
    const permissionsLinkContent = getDocsLinkConditionally(
      t`correct permissions`,
      getDocPageUrl("databases/users-roles-privileges"),
      showMetabaseLinks,
    );

    return [
      {
        key: "ip-addresses" as const,
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- Only visible to admins
        title: t`Try allowing Metabase IP addresses`,
        body: (
          <>
            {
              // eslint-disable-next-line metabase/no-literal-metabase-strings -- Only visible to admins
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
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- Only visible to admins
        title: t`Check Metabase user permissions`,
        body: (() => {
          // unchained `c` -> `jt` call to avoid prettier moving no-literal-metabase-strings comment up
          const ctx = c("{0} refers to 'correct permissions'");
          // eslint-disable-next-line metabase/no-literal-metabase-strings -- Only visible to admins
          return ctx.jt`Check that Metabase has the ${permissionsLinkContent} or user role for your database.`;
        })(),
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
      if (tip.key === "ip-addresses" && !isHosted) {
        // Only show this tip if the user is using Metabase Cloud
        return false;
      }

      const initialTips: TipKey[] = isHosted
        ? ["ip-addresses", "ssl"]
        : ["ssl", "permissions"];
      return expanded || initialTips.includes(tip.key);
    });
  }, [
    expanded,
    getDocPageUrl,
    isHostAndPortError,
    isHosted,
    metabaseIPAddresses,
    showMetabaseLinks,
  ]);
};

const docPageUrlGetter = createSelector([identity], (state: State) => {
  return (page: string): string => getDocsUrl(state, { page });
});
