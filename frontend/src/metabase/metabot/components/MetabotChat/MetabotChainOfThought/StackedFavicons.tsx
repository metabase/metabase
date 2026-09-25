import type { WebSearchResultItem } from "metabase/api/ai-streaming/schemas";
import { Text } from "metabase/ui";

import { Favicon } from "./Favicon";
import S from "./MetabotChainOfThought.module.css";
import { MAX_VISIBLE_FAVICONS } from "./constants";
import { cleanDomain } from "./utils";

const uniqueDomains = (results: WebSearchResultItem[]) =>
  Array.from(new Set(results.map((r) => r.domain ?? cleanDomain(r.url))));

export const StackedFavicons = ({
  results,
}: {
  results: WebSearchResultItem[];
}) => {
  const domains = uniqueDomains(results);
  const visible = domains.slice(0, MAX_VISIBLE_FAVICONS);
  const hidden = domains.length - visible.length;

  if (visible.length === 0) {
    return null;
  }

  return (
    <span className={S.faviconStack} aria-hidden>
      {visible.map((domain) => (
        <Favicon key={domain} domain={domain} className={S.stackedFavicon} />
      ))}
      {hidden > 0 && (
        <Text component="span" className={S.faviconOverflow} lh="inherit">
          +{hidden}
        </Text>
      )}
    </span>
  );
};
