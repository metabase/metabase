import cx from "classnames";
import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";

import EmbedFrameS from "../EmbedFrame.module.css";

import LogoBadgeStyle from "./LogoBadge.module.css";
import MetabaseLogoWithText from "./metabase_logo_with_text.svg?component";

export const LogoBadge = ({ dark }: { dark: boolean }) => {
  const utmContentValue = `embedded_banner_${encodeURIComponent(
    getHostAppUrlDomain(),
  )}`;

  return (
    <ExternalLink
      className={cx(EmbedFrameS.LogoBadge, LogoBadgeStyle.metabaseLink, {
        [LogoBadgeStyle.dark]: dark,
        [LogoBadgeStyle.light]: !dark,
      })}
      href={`https://www.metabase.com?utm_medium=referral&utm_source=product&utm_campaign=powered_by_metabase&utm_content=${utmContentValue}`}
      target="_blank"
    >
      <span>{t`Powered by`}</span>
      {/* eslint-disable-next-line no-literal-metabase-strings -- This embedding badge which we don't want to show the whitelabeled name */}
      <MetabaseLogoWithText height={32} aria-label="Metabase" />
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
