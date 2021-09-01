/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";
import styled from "styled-components";
import { t, jt } from "ttag";

import * as Urls from "metabase/lib/urls";
import { color, lighten } from "metabase/lib/colors";
import { capitalize } from "metabase/lib/formatting";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Text from "metabase/components/type/Text";

import Schema from "metabase/entities/schemas";
import Database from "metabase/entities/databases";
import Table from "metabase/entities/tables";

function getColorForIconWrapper(props) {
  if (props.item.collection_position) {
    return color("warning");
  }
  switch (props.type) {
    case "collection":
      return lighten("brand", 0.35);
    default:
      return color("brand");
  }
}

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: ${getColorForIconWrapper};
  margin-right: 10px;
  flex-shrink: 0;
`;

const ResultLink = styled(Link)`
  display: block;
  background-color: transparent;
  min-height: ${props => (props.compact ? "36px" : "54px")};
  padding-top: 8px;
  padding-bottom: 8px;
  padding-left: 14px;
  padding-right: ${props => (props.compact ? "20px" : "32px")};

  &:hover {
    background-color: ${lighten("brand", 0.63)};

    h3 {
      color: ${color("brand")};
    }
  }

  ${Link} {
    text-underline-position: under;
    text-decoration: underline ${color("text-light")};
    text-decoration-style: dashed;
    &:hover {
      color: ${color("brand")};
      text-decoration-color: ${color("brand")};
    }
  }

  ${Text} {
    margin-top: 0;
    margin-bottom: 0;
    font-size: 13px;
    line-height: 19px;
  }

  h3 {
    font-size: ${props => (props.compact ? "14px" : "16px")};
    line-height: 1.2em;
    word-wrap: break-word;
    margin-bottom: 0;
  }

  .Icon-info {
    color: ${color("text-light")};
  }
`;

function ItemIcon({ item, type }) {
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

const CollectionLink = styled(Link)`
  text-decoration: dashed;
  &:hover {
    color: ${color("brand")};
  }
`;

function CollectionBadge({ collection }) {
  return (
    <CollectionLink to={Urls.collection(collection)}>
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
const Context = styled("p")`
  line-height: 1.4em;
  color: ${color("text-medium")};
  margin-top: 0;
`;

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

function formatCollection(collection) {
  return collection.id && <CollectionBadge collection={collection} />;
}

const Description = styled(Text)`
  padding-left: 8px;
  margin-top: 6px !important;
  border-left: 2px solid ${lighten("brand", 0.45)};
`;

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

function InfoText({ result }) {
  const collection = result.getCollection();
  switch (result.model) {
    case "card":
      return jt`Saved question in ${formatCollection(collection)}`;
    case "collection":
      return t`Collection`;
    case "database":
      return t`Database`;
    case "table":
      return (
        <span>
          {jt`Table in ${(
            <span>
              <Database.Link id={result.database_id} />{" "}
              {result.table_schema && (
                <Schema.ListLoader
                  query={{ dbId: result.database_id }}
                  loadingAndErrorWrapper={false}
                >
                  {({ list }) =>
                    list && list.length > 1 ? (
                      <span>
                        <Icon name="chevronright" mx="4px" size={10} />
                        {/* we have to do some {} manipulation here to make this look like the table object that browseSchema was written for originally */}
                        <Link
                          to={Urls.browseSchema({
                            db: { id: result.database_id },
                            schema_name: result.table_schema,
                          })}
                        >
                          {result.table_schema}
                        </Link>
                      </span>
                    ) : null
                  }
                </Schema.ListLoader>
              )}
            </span>
          )}`}
        </span>
      );
    case "segment":
    case "metric":
      return (
        <span>
          {result.model === "segment" ? t`Segment of ` : t`Metric for `}
          <Link to={Urls.tableRowsQuery(result.database_id, result.table_id)}>
            <Table.Loader id={result.table_id} loadingAndErrorWrapper={false}>
              {({ table }) =>
                table ? <span>{table.display_name}</span> : null
              }
            </Table.Loader>
          </Link>
        </span>
      );
    default:
      return jt`${capitalize(result.model)} in ${formatCollection(collection)}`;
  }
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
