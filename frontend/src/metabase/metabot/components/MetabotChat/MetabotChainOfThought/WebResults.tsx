import cx from "classnames";

import type { WebSearchResultItem } from "metabase/api/ai-streaming/schemas";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import Animation from "metabase/css/core/animation.module.css";
import type { MetabotChainStep } from "metabase/metabot/state";
import { Text } from "metabase/ui";

import { Favicon } from "./Favicon";
import S from "./MetabotChainOfThought.module.css";
import { cleanDomain } from "./utils";

const WebResultRow = ({
  result,
  index,
  animate,
}: {
  result: WebSearchResultItem;
  index: number;
  animate: boolean;
}) => {
  const domain = result.domain ?? cleanDomain(result.url);
  return (
    <ExternalLink
      href={result.url}
      title={result.snippet}
      className={cx(S.resultRow, animate && Animation.fadeIn)}
      style={
        animate
          ? { animationDelay: `${Math.min(index * 45, 360)}ms` }
          : undefined
      }
    >
      <Favicon domain={domain} className={S.resultIcon} />
      <Text component="span" className={S.resultName} c="inherit" lh="inherit">
        {result.title}
      </Text>
      <Text component="span" className={S.resultContext} lh="inherit">
        {domain}
      </Text>
    </ExternalLink>
  );
};

export const WebResultsList = ({
  step,
  animate,
}: {
  step: MetabotChainStep & { kind: "tool" };
  animate: boolean;
}) => {
  if (!step.webResults || step.webResults.results.length === 0) {
    return null;
  }
  return (
    <div className={cx(S.resultsList, S.nested)}>
      {step.webResults.results.map((result, i) => (
        <WebResultRow
          key={result.url}
          result={result}
          index={i}
          animate={animate}
        />
      ))}
    </div>
  );
};
