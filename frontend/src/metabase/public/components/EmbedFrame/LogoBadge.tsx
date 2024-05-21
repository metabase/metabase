import { jt } from "ttag";

import LogoIcon from "metabase/components/LogoIcon";

import type { Variant } from "./LogoBadge.styled";
import { MetabaseLink, MetabaseName, Message } from "./LogoBadge.styled";

export const LogoBadge = ({
  dark,
  variant = "default",
}: {
  dark: boolean;
  variant?: Variant;
}) => {
  const logoSize = variant === "large" ? 42 : 28;

  const utmContentValue = `embedded_banner_${encodeURIComponent(
    getHostAppUrlDomain(),
  )}`;

  const Metabase = (
    // eslint-disable-next-line no-literal-metabase-strings -- This embedding badge which we don't want to show the whitelabeled name
    <MetabaseName key="metabase" isDark={dark} variant={variant}>
      Metabase
    </MetabaseName>
  );

  return (
    <MetabaseLink
      href={`https://www.metabase.com/powered-by-metabase?utm_medium=referral&utm_source=product&utm_campaign=powered_by_metabase&utm_content=${utmContentValue}`}
      target="_blank"
      variant={variant}
    >
      <LogoIcon height={logoSize} dark={dark} />
      <Message variant={variant}>{jt`Powered by ${Metabase}`}</Message>
    </MetabaseLink>
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
