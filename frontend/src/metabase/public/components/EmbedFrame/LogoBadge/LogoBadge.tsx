import cx from "classnames";
import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";

import LogoBadgeStyle from "./LogoBadge.module.css";
import MetabaseLogoWithText from "./metabase_logo_with_text.svg?component";

export const LogoBadge = ({ dark }: { dark: boolean }) => {
  const utmContentValue = `embedded_banner_${encodeURIComponent(
    getHostAppUrlDomain(),
  )}`;

  return (
    <ExternalLink
      className={cx(LogoBadgeStyle.metabaseLink, {
        [LogoBadgeStyle.dark]: dark,
      })}
      href={`https://www.metabase.com/powered-by-metabase?utm_medium=referral&utm_source=product&utm_campaign=powered_by_metabase&utm_content=${utmContentValue}`}
      target="_blank"
    >
      <span>{t`Powered by`}</span>
      <MetabaseLogoWithText />
    </ExternalLink>
  );
};

function getHostAppUrlDomain() {
  // based on https://stackoverflow.com/questions/3420004/access-parent-url-from-iframe
  let referrerUrl =
    parent !== window ? document.referrer : document.location.href;

  // remove trailing slash
  referrerUrl = referrerUrl.replace(/\/+$/, "");

  // get domain value, based on https://stackoverflow.com/questions/569137/how-to-get-domain-name-from-url
  return referrerUrl.replace(/.+\/\/|www.|\..+/g, "");
}
