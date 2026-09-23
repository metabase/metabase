import cx from "classnames";
import { useState } from "react";

import { Icon } from "metabase/ui";

import S from "./MetabotChainOfThought.module.css";
import { FAVICON_SIZE_PX } from "./constants";

export const faviconUrl = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;

export const Favicon = ({
  domain,
  size = FAVICON_SIZE_PX,
  className,
}: {
  domain: string;
  size?: number;
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <Icon name="globe" size={size} className={cx(S.favicon, className)} />
    );
  }

  return (
    <img
      src={faviconUrl(domain)}
      alt={domain}
      width={size}
      height={size}
      className={cx(S.favicon, className)}
      onError={() => setFailed(true)}
    />
  );
};
