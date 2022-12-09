import React from "react";
import PropTypes from "prop-types";
import { t, jt } from "ttag";

import * as Urls from "metabase/lib/urls";

import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";

import Schema from "metabase/entities/schemas";
import Database from "metabase/entities/databases";
import Table from "metabase/entities/tables";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { getTranslatedEntityName } from "metabase/nav/utils";
import { CollectionBadge } from "./CollectionBadge";

const searchResultPropTypes = {
  database_id: PropTypes.number,
  table_id: PropTypes.number,
  model: PropTypes.string,
  getCollection: PropTypes.func,
  collection: PropTypes.object,
  table_schema: PropTypes.string,
};

const infoTextPropTypes = {
  result: PropTypes.shape(searchResultPropTypes),
};

export function InfoText({ result }) {
  switch (result.model) {
    case "app":
      return t`App`;
    case "card":
      return jt`Saved question in ${formatCollection(
        result,
        result.getCollection(),
      )}`;
    case "dataset":
      return jt`Model in ${formatCollection(result, result.getCollection())}`;
    case "collection":
      return getCollectionInfoText(result.collection);
    case "database":
      return t`Database`;
    case "page":
      return t`Page`;
    case "table":
      return <TablePath result={result} />;
    case "segment":
      return jt`Segment of ${(<TableLink result={result} />)}`;
    case "metric":
      return jt`Metric for ${(<TableLink result={result} />)}`;
    default:
      return jt`${getTranslatedEntityName(result.model)} in ${formatCollection(
        result,
        result.getCollection(),
      )}`;
  }
}

InfoText.propTypes = infoTextPropTypes;

function formatCollection(result, collection) {
  return (
    collection.id && (
      <CollectionBadge key={result.model} collection={collection} />
    )
  );
}

function getCollectionInfoText(collection) {
  if (PLUGIN_COLLECTIONS.isRegularCollection(collection)) {
    return t`Collection`;
  }
  const level = PLUGIN_COLLECTIONS.AUTHORITY_LEVEL[collection.authority_level];
  return `${level.name} ${t`Collection`}`;
}

function TablePath({ result }) {
  return jt`Table in ${(
    <span key="table-path">
      <Database.Link id={result.database_id} />{" "}
      {result.table_schema && (
        <Schema.ListLoader
          query={{ dbId: result.database_id }}
          loadingAndErrorWrapper={false}
        >
          {({ list }) =>
            list?.length > 1 ? (
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
  )}`;
}

TablePath.propTypes = {
  result: PropTypes.shape(searchResultPropTypes),
};

function TableLink({ result }) {
  return (
    <Link to={Urls.tableRowsQuery(result.database_id, result.table_id)}>
      <Table.Loader id={result.table_id} loadingAndErrorWrapper={false}>
        {({ table }) => (table ? <span>{table.display_name}</span> : null)}
      </Table.Loader>
    </Link>
  );
}

TableLink.propTypes = {
  result: PropTypes.shape(searchResultPropTypes),
};
