import { Button } from "metabase/ui";
import { color } from "metabase/lib/colors";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Icon } from "metabase/core/components/Icon";
import Text from "metabase/components/type/Text";

import { PLUGIN_COLLECTIONS, PLUGIN_MODERATION } from "metabase/plugins";

import type { SearchScore, SearchModelType } from "metabase-types/api";

import type { WrappedResult } from "metabase/search/types";
import Link from "metabase/core/components/Link/Link";
import {
  IconWrapper,
  ResultButton,
  ResultLink,
  Title,
  TitleWrapper,
  Description,
  ContextText,
  ContextContainer,
  ResultSpinner,
  ResultLinkContent,
  ResultInner,
} from "./SearchResult.styled";
import { InfoText } from "./InfoText";

const DEFAULT_ICON_SIZE = 20;

function TableIcon() {
  return <Icon name="database" />;
}

function CollectionIcon({ item }: { item: WrappedResult }) {
  const iconProps = { ...item.getIcon() };
  const isRegular = PLUGIN_COLLECTIONS.isRegularCollection(item.collection);
  if (isRegular) {
    iconProps.size = DEFAULT_ICON_SIZE;
  } else {
    iconProps.width = 20;
    iconProps.height = 24;
  }
  return <Icon {...iconProps} tooltip={null} />;
}

const ModelIconComponentMap = {
  table: TableIcon,
  collection: CollectionIcon,
};

function DefaultIcon({ item }: { item: WrappedResult }) {
  return <Icon {...item.getIcon()} size={DEFAULT_ICON_SIZE} />;
}

export function ItemIcon({
  item,
  type,
  active,
}: {
  item: WrappedResult;
  type: SearchModelType;
  active: boolean;
}) {
  const IconComponent =
    type in Object.keys(ModelIconComponentMap)
      ? ModelIconComponentMap[type as keyof typeof ModelIconComponentMap]
      : DefaultIcon;

  return (
    <IconWrapper item={item} type={type} active={active}>
      <IconComponent item={item} />
    </IconWrapper>
  );
}

function Score({ scores }: { scores: SearchScore[] }) {
  return (
    <pre className="hide search-score">{JSON.stringify(scores, null, 2)}</pre>
  );
}

// I think it's very likely that this is a dead codepath: RL 2023-06-21
function Context({ context }: { context: any[] }) {
  if (!context) {
    return null;
  }

  return (
    <ContextContainer>
      <ContextText>
        {context.map(({ is_match, text }, i: number) => {
          if (!is_match) {
            return <span key={i}> {text}</span>;
          }

          return (
            <strong key={i} style={{ color: color("brand") }}>
              {" "}
              {text}
            </strong>
          );
        })}
      </ContextText>
    </ContextContainer>
  );
}

export function SearchResult({
  result,
  compact = false,
  hasDescription = true,
  onClick = undefined,
  isSelected = false,
}: {
  result: WrappedResult;
  compact?: boolean;
  hasDescription?: boolean;
  onClick?: (result: WrappedResult) => void;
  isSelected?: boolean;
}) {
  const active = isItemActive(result);
  const loading = isItemLoading(result);

  // we want to remove link behavior if we have an onClick handler
  const ResultContainer = onClick ? ResultButton : ResultLink;

  const showXRayButton =
    result.model === "indexed-entity" &&
    result.id !== undefined &&
    result.model_index_id !== null;

  return (
    <ResultContainer
      isSelected={isSelected}
      active={active}
      compact={compact}
      to={!onClick ? result.getUrl() : ""}
      onClick={onClick && active ? () => onClick(result) : undefined}
      data-testid="search-result-item"
    >
      <ResultInner>
        <ResultLinkContent>
          <ItemIcon item={result} type={result.model} active={active} />
          <div>
            <TitleWrapper>
              <Title active={active} data-testid="search-result-item-name">
                {result.name}
              </Title>
              <PLUGIN_MODERATION.ModerationStatusIcon
                status={result.moderated_status}
                size={12}
              />
            </TitleWrapper>
            <Text data-testid="result-link-info-text">
              <InfoText result={result} />
            </Text>
            {hasDescription && result.description && (
              <Description>{result.description}</Description>
            )}
            <Score scores={result.scores} />
          </div>
          {loading && (
            // SearchApp also uses `loading-spinner`, using a different test ID
            // to not confuse unit tests waiting for loading-spinner to disappear
            <ResultSpinner
              data-testid="search-result-loading-spinner"
              size={24}
              borderWidth={3}
            />
          )}
        </ResultLinkContent>
        {showXRayButton && (
          <Button
            onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
              e.stopPropagation()
            }
            variant="outline"
            p="sm"
          >
            <Link
              to={`/auto/dashboard/model_index/${result.model_index_id}/primary_key/${result.id}`}
            >
              <Icon name="bolt" />
            </Link>
          </Button>
        )}
      </ResultInner>
      {compact || <Context context={result.context} />}
    </ResultContainer>
  );
}

const isItemActive = (result: WrappedResult) => {
  switch (result.model) {
    case "table":
      return isSyncCompleted(result);
    default:
      return true;
  }
};

const isItemLoading = (result: WrappedResult) => {
  switch (result.model) {
    case "database":
    case "table":
      return !isSyncCompleted(result);
    default:
      return false;
  }
};
