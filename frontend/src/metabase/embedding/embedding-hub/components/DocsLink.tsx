import type { ReactNode } from "react";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks/use-docs-url";
import CS from "metabase/css/core/index.css";
import type { UtmProps } from "metabase/selectors/settings";

interface DocsLinkProps {
  docsPath: string;
  anchor?: string;
  utm: Required<Pick<UtmProps, "utm_campaign" | "utm_content">>;
  children: ReactNode;
}

export const DocsLink = ({
  docsPath,
  anchor,
  utm,
  children,
}: DocsLinkProps) => {
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- we are in admin so we must always show the link.
  const { url } = useDocsUrl(docsPath, {
    anchor,
    utm: {
      utm_source: "product",
      utm_campaign: utm.utm_campaign,
      utm_medium: "docs",
      utm_content: utm.utm_content,
    },
  });

  return (
    <ExternalLink href={url} className={CS.noDecoration}>
      {children}
    </ExternalLink>
  );
};
