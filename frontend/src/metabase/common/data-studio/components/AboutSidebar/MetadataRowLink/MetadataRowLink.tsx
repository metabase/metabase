import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link/Link";
import { Text } from "metabase/ui";

import S from "./MetadataRowLink.module.css";

interface MetadataRowLinkProps {
  to: string;
  children: ReactNode;
}

export function MetadataRowLink({ to, children }: MetadataRowLinkProps) {
  return (
    <Link to={to} className={S.link}>
      <Text component="span" fw={600} className={S.text}>
        {children}
      </Text>
    </Link>
  );
}
