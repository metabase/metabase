import cx from "classnames";
import { Fragment } from "react";

import type { SearchResultItem } from "metabase/api/ai-streaming/schemas";
import { EntityIcon } from "metabase/common/components/EntityIcon";
import { Link } from "metabase/common/components/Link";
import {
  type IconData,
  type IconModel,
  modelIconMap,
} from "metabase/common/utils/icon";
import Animation from "metabase/css/core/animation.module.css";
import { useGetIcon } from "metabase/hooks/use-icon";
import type { MetabotChainStep } from "metabase/metabot/state";
import { Text } from "metabase/ui";
import { modelToUrl } from "metabase/urls";

import S from "./MetabotChainOfThought.module.css";
import { resultContextParts, toModel } from "./utils";

const isIconModel = (model: string): model is IconModel =>
  model in modelIconMap;

const ResultContext = ({ result }: { result: SearchResultItem }) => {
  const parts = resultContextParts(result);
  if (parts.length === 0) {
    return null;
  }
  return (
    <Text component="span" className={S.resultContext} lh="inherit">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className={S.contextSeparator} aria-hidden>
              /
            </span>
          )}
          {part}
        </Fragment>
      ))}
    </Text>
  );
};

const ResultIcon = ({ result }: { result: SearchResultItem }) => {
  const getIcon = useGetIcon();
  const model = toModel(result.type);
  const iconData: IconData = isIconModel(model)
    ? getIcon({
        model,
        display: result.display,
        moderated_status: result.moderated_status,
      })
    : { name: "document" };
  return <EntityIcon {...iconData} size={13} className={S.resultIcon} />;
};

const SearchResultRow = ({
  result,
  index,
  animate,
}: {
  result: SearchResultItem;
  index: number;
  animate: boolean;
}) => (
  <Link
    to={modelToUrl({
      id: result.id,
      model: toModel(result.type),
      name: result.name,
      database_id: result.database_id,
    })}
    className={cx(S.resultRow, animate && Animation.fadeIn)}
    style={
      animate ? { animationDelay: `${Math.min(index * 45, 360)}ms` } : undefined
    }
  >
    <ResultIcon result={result} />
    <Text component="span" className={S.resultName} c="inherit" lh="inherit">
      {result.display_name ?? result.name}
    </Text>
    <ResultContext result={result} />
  </Link>
);

export const SearchResultsList = ({
  step,
  animate,
}: {
  step: MetabotChainStep & { kind: "tool" };
  animate: boolean;
}) => {
  if (!step.searchResults || step.searchResults.results.length === 0) {
    return null;
  }
  return (
    <div className={S.resultsList}>
      {step.searchResults.results.map((result, i) => (
        <SearchResultRow
          key={`${result.type}-${result.id}`}
          result={result}
          index={i}
          animate={animate}
        />
      ))}
    </div>
  );
};
