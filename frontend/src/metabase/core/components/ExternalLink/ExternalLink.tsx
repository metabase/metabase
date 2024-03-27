import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";
import { forwardRef } from "react";

import CS from "metabase/css/core/index.css";
import { getUrlTarget } from "metabase/lib/dom";

import { LinkRoot } from "./ExternalLink.styled";

interface Props extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  target?: string;
  className?: string;
  children?: ReactNode;
}

const ExternalLink = forwardRef(function ExternalLink(
  { href, target = getUrlTarget(href), className, children, ...props }: Props,
  ref: Ref<HTMLAnchorElement>,
) {
  return (
    <LinkRoot
      ref={ref}
      href={href}
      className={className || CS.link}
      target={target}
      // prevent malicious pages from navigating us away
      rel="noopener noreferrer"
      // disables quickfilter in tables
      onClickCapture={e => e.stopPropagation()}
      {...props}
    >
      {children}
    </LinkRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ExternalLink;
