import React from "react";
import PropTypes from "prop-types";
import styled from "styled-components";
import { jt } from "ttag";

import * as Urls from "metabase/lib/urls";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import Database from "metabase/entities/databases";
import Collection from "metabase/entities/collections";
import Schema from "metabase/entities/schemas";

import { color } from "metabase/lib/colors";

export const ItemLocation = ({ item }) => {
  switch (item.model) {
    case "dataset":
      return <DatasetLocation item={item} />;
    case "card":
      return <QuestionLocation item={item} />;
    case "table":
      return <TableLocation item={item} />;
    default:
      return null;
  }
};

function DatasetLocation({ item }) {
  const collection = item.getCollection();
  return jt`Dataset in ${(
    <Collection.Link id={collection.id} LinkComponent={LocationLink} />
  )}`;
}

DatasetLocation.propTypes = {
  item: PropTypes.object.isRequired,
};

ItemLocation.propTypes = {
  item: PropTypes.object.isRequired,
};

const QuestionLocation = ({ item }) => {
  const collection = item.getCollection();
  return jt`Saved question in ${(
    <Collection.Link id={collection.id} LinkComponent={LocationLink} />
  )}`;
};

QuestionLocation.propTypes = {
  item: PropTypes.object.isRequired,
};

const TableLocation = ({ item }) => (
  <span>
    {jt`Table in ${(
      <React.Fragment>
        <Database.Link id={item.database_id} LinkComponent={LocationLink} />
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
