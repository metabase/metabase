/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";

import { color } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import Text from "metabase/components/type/Text";

import InfoText from "./InfoText";

import {
  IconWrapper,
  Context,
  ResultLink,
  Title,
  Description,
} from "./SearchResult.styled";

export function ItemIcon({ item, type }) {
  return (
    <IconWrapper item={item} type={type}>
      {type === "table" ? (
        <Icon name="database" />
      ) : (
        <Icon name={item.getIcon()} size={20} />
      )}
    </IconWrapper>
  );
}

function Score({ scores }) {
  return (
    <pre className="hide search-score">{JSON.stringify(scores, null, 2)}</pre>
  );
}

function formatContext(context, compact) {
  return (
    !compact &&
    context && (
      <Box ml="42px" mt="12px" style={{ maxWidth: 620 }}>
        <Context>{contextText(context)}</Context>
      </Box>
    )
  );
}

function contextText(context) {
  return context.map(function({ is_match, text }, i) {
    if (is_match) {
      return (
        <strong key={i} style={{ color: color("brand") }}>
          {" "}
          {text}
        </strong>
      );
    } else {
      return <span key={i}> {text}</span>;
    }
  });
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
          <Title>{result.name}</Title>
          <Text>
            <InfoText result={result} />
          </Text>
          {result.description && (
            <Description>{result.description}</Description>
          )}
          <Score scores={result.scores} />
        </Box>
      </Flex>
      {formatContext(result.context, compact)}
    </ResultLink>
  );
}
