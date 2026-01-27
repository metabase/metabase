import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";
import { forwardRef } from "react";

import CS from "metabase/css/core/index.css";
import { getUrlTarget } from "metabase/lib/dom";

import S from "./ExternalLink.module.css";

interface Props extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  target?: string;
  className?: string;
  children?: ReactNode;
}

export const ExternalLink = forwardRef(function ExternalLink(
  { href, target = getUrlTarget(href), className, children, ...props }: Props,
  ref: Ref<HTMLAnchorElement>,
) {
  return (
    <a
      ref={ref}
      href={href}
      className={`${S.LinkRoot} ${className || CS.link}`}
      target={target}
      // prevent malicious pages from navigating us away
      rel="noopener noreferrer"
      // disables quickfilter in tables
      onClickCapture={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </a>
  );
});

export const ButtonLink = forwardRef(function ButtonLink(
  props: Props,
  ref: Ref<HTMLAnchorElement>,
) {
  return <ExternalLink {...props} className={S.ButtonLink} ref={ref} />;
});
