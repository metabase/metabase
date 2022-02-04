/* eslint-disable react/prop-types */
import React from "react";

import { color } from "metabase/lib/colors";
import { isSyncCompleted } from "metabase/lib/syncing";

import Icon from "metabase/components/Icon";
import Text from "metabase/components/type/Text";

import { PLUGIN_COLLECTIONS, PLUGIN_MODERATION } from "metabase/plugins";

import {
  IconWrapper,
  ResultLink,
  Title,
  TitleWrapper,
  Description,
  ContextText,
  ContextContainer,
  ResultSpinner,
  ResultLinkContent,
} from "./SearchResult.styled";
import { InfoText } from "./InfoText";

const DEFAULT_ICON_SIZE = 20;

function TableIcon() {
  return <Icon name="database" />;
}

function CollectionIcon({ item }) {
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

function DefaultIcon({ item }) {
  return <Icon {...item.getIcon()} size={DEFAULT_ICON_SIZE} />;
}

export function ItemIcon({ item, type, active }) {
  const IconComponent = ModelIconComponentMap[type] || DefaultIcon;
  return (
    <IconWrapper item={item} type={type} active={active}>
      <IconComponent item={item} />
    </IconWrapper>
  );
}

function Score({ scores }) {
  return (
    <pre className="hide search-score">{JSON.stringify(scores, null, 2)}</pre>
  );
}

function Context({ context }) {
  if (!context) {
    return null;
  }

  return (
    <ContextContainer>
      <ContextText>
        {context.map(({ is_match, text }, i) => {
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

export default function SearchResult({
  result,
  compact,
  hasDescription = true,
  onClick,
}) {
  const active = isItemActive(result);
  const loading = isItemLoading(result);

  return (
    <ResultLink
      active={active}
      compact={compact}
      to={!onClick ? result.getUrl() : ""}
      onClick={onClick ? () => onClick(result) : undefined}
      data-testid="search-result-item"
    >
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
          <Text>
            <InfoText result={result} />
          </Text>
          {hasDescription && result.description && (
            <Description>{result.description}</Description>
          )}
          <Score scores={result.scores} />
        </div>
        {loading && <ResultSpinner size={24} borderWidth={3} />}
      </ResultLinkContent>
      {compact || <Context context={result.context} />}
    </ResultLink>
  );
}

const isItemActive = result => {
  switch (result.model) {
    case "table":
      return isSyncCompleted(result);
    default:
      return true;
  }
};

const isItemLoading = result => {
  switch (result.model) {
    case "database":
    case "table":
      return !isSyncCompleted(result);
    default:
      return false;
  }
};
