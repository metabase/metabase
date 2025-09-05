import type { ReactNode } from "react";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks/use-docs-url";
import type { UtmProps } from "metabase/selectors/settings";
import { Button, Icon } from "metabase/ui";

interface DocsLinkProps {
  docsPath: string;
  utm: Required<Pick<UtmProps, "utm_campaign" | "utm_content">>;
  children: ReactNode;
}

export const DocsLink = ({ docsPath, utm, children }: DocsLinkProps) => {
  // eslint-disable-next-line no-unconditional-metabase-links-render -- we are in admin so we must always show the link.
  const { url } = useDocsUrl(docsPath, {
    utm: {
      utm_source: "product",
      utm_campaign: utm.utm_campaign,
      utm_medium: "docs",
      utm_content: utm.utm_content,
    },
  });

  return (
    <Button
      variant="outline"
      component={ExternalLink}
      href={url}
      rightSection={<Icon name="external" />}
    >
      {children}
    </Button>
  );
};
