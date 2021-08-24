/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";

import { color } from "metabase/lib/colors";

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

export function ItemIcon({ item, type }) {
  const IconComponent = ModelIconComponentMap[type] || DefaultIcon;
  return (
    <IconWrapper item={item} type={type}>
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
    <Box ml="42px" mt="12px" style={{ maxWidth: 620 }}>
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
    </Box>
  );
}

export default function SearchResult({ result, compact }) {
  return (
    <ResultLink
      to={result.getUrl()}
      compact={compact}
      data-testid="search-result-item"
    >
      <Flex align="start">
        <ItemIcon item={result} type={result.model} />
        <Box>
          <TitleWrapper>
            <Title>{result.name}</Title>
            <PLUGIN_MODERATION.ModerationStatusIcon
              status={result.moderated_status}
              size={12}
            />
          </TitleWrapper>
          <Text>
            <InfoText result={result} />
          </Text>
          {result.description && (
            <Description>{result.description}</Description>
          )}
          <Score scores={result.scores} />
        </Box>
      </Flex>
      {!compact && <Context context={result.context} />}
    </ResultLink>
  );
}
