import React, { AnchorHTMLAttributes, forwardRef, ReactNode, Ref } from "react";
import { getUrlTarget } from "metabase/lib/dom";

interface Props extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  target?: string;
  className?: string;
  children?: ReactNode;
  tabIndex?: number;
}

const ExternalLink = forwardRef(function ExternalLink(
  { href, target = getUrlTarget(href), className, tabIndex = 0, children, ...props }: Props,
  ref: Ref<HTMLAnchorElement>,
) {
  return (
    <a
      ref={ref}
      href={href}
      className={className || "link"}
      target={target}
      // prevent malicious pages from navigating us away
      rel="noopener noreferrer"
      // disables quickfilter in tables
      onClickCapture={e => e.stopPropagation()}
      tabIndex={tabIndex}
      {...props}
    >
      {children}
    </a>
  );
});

export default ExternalLink;
