import React from "react";
import { Box, Flex } from "grid-styled";
import styled from "styled-components";

import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Tooltip from "metabase/components/Tooltip";

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 99px;
  background-color: #ddecfa;
  color: ${color("brand")};
  margin-right: 10px;
  flex-shrink: 0;
`;

const ResultLink = styled(Link)`
  display: flex;
  flex-direction: column;
  justify-content: center;
  background-color: transparent;
  border-radius: 6px;
  min-height: 54px;
  padding-top: 8px;
  padding-bottom: 8px;
  padding-left: 8px;
  padding-right: 8px;

  &:hover {
    background-color: #fafafa;

    h3 {
      color: ${color("brand")};
    }
  }

  h3 {
    line-height: 1.2em;
    word-wrap: break-word;
  }

  .Icon-info {
    color: ${color("text-light")};
  }
`;

function ItemIcon({ item }) {
  return (
    <IconWrapper item={item}>
      <Icon name={item.getIcon()} />
    </IconWrapper>
  );
}

export default function SearchResult(props) {
  const { result } = props;
  switch (result.model) {
    case "card":
      return <QuestionResult question={result} options={props} />;
    case "collection":
      return <CollectionResult collection={result} options={props} />;
    case "dashboard":
      return <DashboardResult dashboard={result} options={props} />;
    default:
      // metric, segment, and table deliberately included here
      return <DefaultResult result={result} options={props} />;
  }
}

const CollectionLink = styled(Link)`
  display: flex;
  align-items: center;

  font-size: 12px;
  line-height: 12px;
  font-weight: bold;
  color: ${color("text-medium")};

  .Icon {
    color: ${color("text-light")};
  }

  &:hover {
    color: ${color("brand")};
    .Icon {
      color: ${color("brand")};
    }
  }
`;

function CollectionBadge({ collection }) {
  return (
    <CollectionLink to={Urls.collection(collection.id)}>
      <Icon name="folder" size={12} mr="4px" />
      {collection.name}
    </CollectionLink>
  );
}

const Title = styled("h3")`
  margin-bottom: 4px;
`;

function Score({ scores }) {
  return (
    <pre className="hide search-score">{JSON.stringify(scores, null, 2)}</pre>
  );
}

// Generally these should be at the bottom of the list I'd hope
function CollectionResult({ collection }) {
  return (
    <ResultLink to={Urls.collection(collection.id)}>
      <Flex align="center">
        <ItemIcon item={collection} />
        <Title>{collection.name}</Title>
        <Score scores={collection.scores} />
      </Flex>
    </ResultLink>
  );
}

function contextText(context) {
  return context.map(function({ is_match, text }) {
    if (is_match) {
      return <strong> {text}</strong>;
    } else {
      return <span> {text}</span>;
    }
  });
}

function formatContext(context, compact) {
  return (
    !compact &&
    context && (
      <Box ml="42px" mt="12px">
        {contextText(context)}
      </Box>
    )
  );
}

function formatCollection(collection) {
  return collection.id && <CollectionBadge collection={collection} />;
}

function DashboardResult({ dashboard, options }) {
  return (
    <ResultLink to={dashboard.getUrl()}>
      <Flex align="center">
        <ItemIcon item={dashboard} />
        <Box>
          <Title>{dashboard.name}</Title>
          {formatCollection(dashboard.getCollection())}
          <Score scores={dashboard.scores} />
        </Box>
      </Flex>
      {formatContext(dashboard.context, options.compact)}
    </ResultLink>
  );
}

function QuestionResult({ question, options }) {
  return (
    <ResultLink to={question.getUrl()}>
      <Flex align="center">
        <ItemIcon item={question} />
        <Box>
          <Title>{question.name}</Title>
          {formatCollection(question.getCollection())}
          <Score scores={question.scores} />
        </Box>
        {question.description && (
          <Box ml="auto">
            <Tooltip tooltip={question.description}>
              <Icon name="info" />
            </Tooltip>
          </Box>
        )}
      </Flex>
      {formatContext(question.context, options.compact)}
    </ResultLink>
  );
}

function DefaultResult({ result, options }) {
  return (
    <ResultLink to={result.getUrl()}>
      <Flex align="center">
        <ItemIcon item={result} />
        <Box>
          <Title>{result.name}</Title>
          {formatCollection(result.getCollection())}
          <Score scores={result.scores} />
        </Box>
      </Flex>
      {formatContext(result.context, options.compact)}
    </ResultLink>
  );
}
