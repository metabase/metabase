/* eslint-disable react/prop-types */
import React from "react";

import { getUrlTarget } from "metabase/lib/dom";

type Props = {
  href: string,
  target?: string,
  className?: string,
  children?: React.ReactNode
}

const ExternalLink: React.FC<Props> = ({
  href,
  target = getUrlTarget(href),
  className,
  children,
  ...props
}) => (
  <a
    href={href}
    className={className || "link"}
    target={target}
    // prevent malicious pages from navigating us away
    rel="noopener noreferrer"
    // disables quickfilter in tables
    onClickCapture={e => e.stopPropagation()}
    {...props}
  >
    {children}
  </a>
);

export default ExternalLink;
