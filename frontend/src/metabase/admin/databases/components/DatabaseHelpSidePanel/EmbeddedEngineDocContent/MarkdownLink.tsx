import type { ComponentProps } from "react";
import { Link } from "react-router";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

export const MarkdownLink = ({ href, children }: ComponentProps<"a">) => {
  const parsedUrl = useSelector((state) => getParsedMDLinkUrl(state, href));

  return (
    <Link to={parsedUrl} className={CS.link} target="_blank">
      {children}
    </Link>
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
