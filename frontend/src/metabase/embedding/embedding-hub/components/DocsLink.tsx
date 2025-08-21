import type { ReactNode } from "react";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks/use-docs-url";

interface DocsLinkProps {
  docsPath: string;
  children: ReactNode;
}

export const DocsLink = ({ docsPath, children }: DocsLinkProps) => {
  const { url, showMetabaseLinks } = useDocsUrl(docsPath);

  if (!showMetabaseLinks) {
    return null;
  }

  return <ExternalLink href={url}>{children}</ExternalLink>;
};
