import type { HTMLAttributes } from "react";

import type { LinkProps } from "metabase/common/components/Link";
import { Link } from "metabase/common/components/Link";

interface MaybeLinkProps {
  to?: string;
}

export const MaybeLink = ({
  to,
  ...props
}: MaybeLinkProps & (LinkProps | HTMLAttributes<HTMLSpanElement>)) =>
  to ? <Link to={to} {...props} /> : <span {...props} />;
