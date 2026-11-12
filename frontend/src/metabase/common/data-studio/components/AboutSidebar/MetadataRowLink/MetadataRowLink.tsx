import type { ReactNode } from "react";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link/Link";
import { Text } from "metabase/ui";

import S from "./MetadataRowLink.module.css";

type MetadataRowLinkProps = {
  children: ReactNode;
} & (
  | { to: string; href?: never }
  | {
      /** A URL outside Metabase, opened in a new tab. */
      href: string;
      to?: never;
    }
);

export function MetadataRowLink(props: MetadataRowLinkProps) {
  const text = (
    <Text component="span" fw={600} className={S.text}>
      {props.children}
    </Text>
  );

  if (props.href !== undefined) {
    return (
      <ExternalLink href={props.href} className={S.link}>
        {text}
      </ExternalLink>
    );
  }

  return (
    <Link to={props.to} className={S.link}>
      {text}
    </Link>
  );
}
