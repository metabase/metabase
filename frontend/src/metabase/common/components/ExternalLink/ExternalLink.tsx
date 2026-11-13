import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";
import { forwardRef } from "react";

import CS from "metabase/css/core/index.css";
import { Button, Icon } from "metabase/ui";
import { getUrlTarget } from "metabase/urls";

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
      role="link"
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

interface ButtonLinkProps {
  href: string;
  children: ReactNode;
}

/**
 * An external link that looks like a filled brand `Button`, with an external
 * link icon after the label. Opens in a new tab for links outside Metabase.
 */
export function ButtonLink({ href, children }: ButtonLinkProps) {
  return (
    <Button
      component={ExternalLink}
      href={href}
      variant="filled"
      size="lg"
      rightSection={<Icon name="external" aria-hidden />}
    >
      {children}
    </Button>
  );
}
