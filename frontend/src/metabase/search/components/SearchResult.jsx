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

export default function SearchResult({ result }) {
  switch (result.model) {
    case "card":
      return <QuestionResult question={result} />;
    case "dashboard":
      return <DashboardResult dashboard={result} />;
    case "collection":
      return <CollectionResult collection={result} />;
    default:
      return <div>{result.name}</div>;
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

// Generally these should be at the bottom of the list I'd hope
function CollectionResult({ collection }) {
  return (
    <ResultLink to={Urls.collection(collection.id)}>
      <Flex align="center">
        <ItemIcon item={collection} />
        <Title>{collection.name}</Title>
      </Flex>
    </ResultLink>
  );
}

function QuestionResult({ question }) {
  return (
    <ResultLink to={Urls.question(question.id)}>
      <Flex align="center">
        <ItemIcon item={question} />
        <Box>
          <Title>{question.name}</Title>
          <CollectionBadge collection={question.collection} />
        </Box>
        {question.description && (
          <Box ml="auto">
            <Tooltip tooltip={question.description}>
              <Icon name="info" />
            </Tooltip>
          </Box>
        )}
      </Flex>
      {question.context && (
        <Box ml="42px" mt="12px">
          <strong>{question.context.match}:</strong> {question.context.content}
        </Box>
      )}
    </ResultLink>
  );
}

function DashboardResult({ dashboard }) {
  return (
    <ResultLink>
      <Flex align="center">
        <ItemIcon item={dashboard} />
        <Box>
          <Title>{dashboard.name}</Title>
          <CollectionBadge collection={dashboard.collection} />
        </Box>
      </Flex>
      {dashboard.context && (
        <Box ml="42px" mt="12px">
          <strong>{dashboard.context.match}:</strong>{" "}
          {dashboard.context.content}
        </Box>
      )}
    </ResultLink>
  );
}
