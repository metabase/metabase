import type { ComponentProps } from "react";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

export const MarkdownLink = ({ href, children }: ComponentProps<"a">) => {
  const parsedUrl = useSelector((state) => getParsedMDLinkUrl(state, href));

  return (
    <a href={parsedUrl} className={CS.link} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
};

const getParsedMDLinkUrl = (state: State, href?: string) => {
  if (href?.includes(".md") && !href?.startsWith("http")) {
    const relativeDocPath = href.replace(".md", "");
    const finalPath = `databases/connections/${relativeDocPath}`;
    return getDocsUrl(state, { page: finalPath });
  }

  return href || "";
};
