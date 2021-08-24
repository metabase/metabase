import React from "react";
import { t, jt } from "ttag";

import * as Urls from "metabase/lib/urls";
import { capitalize } from "metabase/lib/formatting";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import Schema from "metabase/entities/schemas";
import Database from "metabase/entities/databases";
import Table from "metabase/entities/tables";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { CollectionBadge } from "./CollectionBadge";

function formatCollection(collection) {
  return collection.id && <CollectionBadge collection={collection} />;
}

function getCollectionInfoText(collection) {
  if (PLUGIN_COLLECTIONS.isRegularCollection(collection)) {
    return t`Collection`;
  }
  const level = PLUGIN_COLLECTIONS.AUTHORITY_LEVEL[collection.authority_level];
  return `${level.name} ${t`Collection`}`;
}

export function InfoText({ result }) {
  const collection = result.getCollection();
  switch (result.model) {
    case "card":
      return jt`Saved question in ${formatCollection(collection)}`;
    case "collection":
      return getCollectionInfoText(result.collection);
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
