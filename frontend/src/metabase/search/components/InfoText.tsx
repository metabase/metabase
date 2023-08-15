import { t, jt } from "ttag";

import * as Urls from "metabase/lib/urls";

import { Icon } from "metabase/core/components/Icon";
import Link from "metabase/core/components/Link";

import Schema from "metabase/entities/schemas";
import Database from "metabase/entities/databases";
import Table from "metabase/entities/tables";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { getTranslatedEntityName } from "metabase/nav/utils";

import type { Collection } from "metabase-types/api";
import type { WrappedResult } from "metabase/search/types";
import type TableType from "metabase-lib/metadata/Table";

import { CollectionBadge } from "./CollectionBadge";

export function InfoText({ result }: { result: WrappedResult }) {
  let textContent: string | string[] | JSX.Element;

  switch (result.model) {
    case "card":
      textContent = jt`Saved question in ${formatCollection(
        result,
        result.getCollection(),
      )}`;
      break;
    case "dataset":
      textContent = jt`Model in ${formatCollection(
        result,
        result.getCollection(),
      )}`;
      break;
    case "collection":
      textContent = getCollectionInfoText(result.collection);
      break;
    case "database":
      textContent = t`Database`;
      break;
    case "table":
      textContent = <TablePath result={result} />;
      break;
    case "segment":
      textContent = jt`Segment of ${(<TableLink result={result} />)}`;
      break;
    case "metric":
      textContent = jt`Metric for ${(<TableLink result={result} />)}`;
      break;
    case "action":
      textContent = jt`for ${result.model_name}`;
      break;
    case "indexed-entity":
      textContent = jt`in ${result.model_name}`;
      break;
    default:
      textContent = jt`${getTranslatedEntityName(
        result.model,
      )} in ${formatCollection(result, result.getCollection())}`;
      break;
  }

  return <>{textContent}</>;
}

function formatCollection(
  result: WrappedResult,
  collection: Partial<Collection>,
) {
  return (
    collection.id && (
      <CollectionBadge key={result.model} collection={collection} />
    )
  );
}

function getCollectionInfoText(collection: Partial<Collection>) {
  if (
    PLUGIN_COLLECTIONS.isRegularCollection(collection) ||
    !collection.authority_level
  ) {
    return t`Collection`;
  }
  const level = PLUGIN_COLLECTIONS.AUTHORITY_LEVEL[collection.authority_level];
  return `${level.name} ${t`Collection`}`;
}

function TablePath({ result }: { result: WrappedResult }) {
  return (
    <>
      {jt`Table in ${(
        <span key="table-path">
          <Database.Link id={result.database_id} />{" "}
          {result.table_schema && (
            <Schema.ListLoader
              query={{ dbId: result.database_id }}
              loadingAndErrorWrapper={false}
            >
              {({ list }: { list: typeof Schema[] }) =>
                list?.length > 1 ? (
                  <span>
                    <Icon name="chevronright" size={10} />
                    {/* we have to do some {} manipulation here to make this look like the table object that browseSchema was written for originally */}
                    <Link
                      to={Urls.browseSchema({
                        db: { id: result.database_id },
                        schema_name: result.table_schema,
                      } as TableType)}
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
    </>
  );
}

function TableLink({ result }: { result: WrappedResult }) {
  return (
    <Link to={Urls.tableRowsQuery(result.database_id, result.table_id)}>
      <Table.Loader id={result.table_id} loadingAndErrorWrapper={false}>
        {({ table }: { table: TableType }) =>
          table ? <span>{table.display_name}</span> : null
        }
      </Table.Loader>
    </Link>
  );
}
