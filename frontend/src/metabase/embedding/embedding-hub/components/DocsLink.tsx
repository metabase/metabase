import type { ReactNode } from "react";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks/use-docs-url";
import { Button, Icon } from "metabase/ui";

interface DocsLinkProps {
  docsPath: string;
  children: ReactNode;
}

export const DocsLink = ({ docsPath, children }: DocsLinkProps) => {
  // eslint-disable-next-line no-unconditional-metabase-links-render -- we are in admin so we must always show the link.
  const { url } = useDocsUrl(docsPath);

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
