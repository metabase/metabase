import React from "react";
import PropTypes from "prop-types";
import styled from "styled-components";
import { jt } from "ttag";

import * as Urls from "metabase/lib/urls";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import Schema from "metabase/entities/schemas";
import Database from "metabase/entities/databases";

import { color } from "metabase/lib/colors";

export const ItemLocation = ({ item }) => {
  switch (item.model) {
    case "card":
      return <QuestionLocation item={item} />;
    case "table":
      return <TableLocation item={item} />;
    default:
      return null;
  }
};

ItemLocation.propTypes = {
  item: PropTypes.object.isRequired,
};

const QuestionLocation = ({ item }) => {
  const collection = item.getCollection();

  return jt`Saved question in ${(
    <LocationLink to={Urls.collection(collection.id)}>
      {collection.name}
    </LocationLink>
  )}`;
};

QuestionLocation.propTypes = {
  item: PropTypes.object.isRequired,
};

const TableLocation = ({ item }) => (
  <span>
    {jt`Table in ${(
      <React.Fragment>
        <LocationLink to={Urls.browseDatabase({ id: item.database_id })}>
          <Database.Name id={item.database_id} />
        </LocationLink>
        {item.table_schema && (
          <Schema.ListLoader
            query={{ dbId: item.database_id }}
            loadingAndErrorWrapper={false}
          >
            {({ list }) =>
              list && list.length > 1 ? (
                <React.Fragment>
                  <Icon
                    className="text-light"
                    name="chevronright"
                    mx="4px"
                    size={10}
                  />
                  <LocationLink
                    to={Urls.browseSchema({
                      db: { id: item.database_id },
                      schema_name: item.table_schema,
                    })}
                  >
                    {item.table_schema}
                  </LocationLink>
                </React.Fragment>
              ) : null
            }
          </Schema.ListLoader>
        )}
      </React.Fragment>
    )}`}
  </span>
);

TableLocation.propTypes = {
  item: PropTypes.object.isRequired,
};

const LocationLink = styled(Link)`
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-position: under;
  &:hover {
    color: ${color("brand")};
  }
`;
