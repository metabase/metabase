import cx from "classnames";
import { useEffect } from "react";
import { replace } from "react-router-redux";
import { t } from "ttag";

import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { TableBrowser } from "metabase/browse/tables/TableBrowser";
import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { findDatabaseByName } from "metabase/common/utils/database";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/redux";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DatabaseId } from "metabase-types/api";

import { BrowseCard } from "../components/BrowseCard";
import S from "../components/BrowseContainer.module.css";
import { BrowseDataHeader } from "../components/BrowseDataHeader";
import { BrowseGrid } from "../components/BrowseGrid";

type Schema = { id: string; name: string };

const DatabaseName = ({ id }: { id: DatabaseId | null | undefined }) => {
  const { data: database } = useGetDatabaseQuery(
    id != null ? { id } : skipToken,
  );
  return <>{database?.name ?? ""}</>;
};

const BrowseSchemasContainer = ({
  schemas,
  params,
}: {
  schemas: Schema[];
  params: any;
}) => {
  const { slug } = params;
  const dbId = Urls.extractEntityId(slug);
  return (
    <Flex
      className={S.browseContainer}
      flex={1}
      direction="column"
      wrap="nowrap"
      pt="md"
      data-testid="browse-schemas"
    >
      <BrowseDataHeader />
      <Flex className={S.browseMain} direction="column" wrap="nowrap" flex={1}>
        <Flex maw="64rem" mx="auto" w="100%" direction="column">
          {schemas.length === 1 ? (
            <TableBrowser
              params={params}
              dbId={dbId}
              schemaName={schemas[0].name}
              // hide the schema since there's only one
              showSchemaInHeader={false}
            />
          ) : (
            <>
              <Flex align="center" pt="md" pr="sm" pb="sm">
                <BrowserCrumbs
                  crumbs={[
                    { title: t`Databases`, to: "/browse/databases" },
                    { title: <DatabaseName id={dbId} /> },
                  ]}
                />
              </Flex>
              {schemas.length === 0 ? (
                <h2
                  className={cx(CS.full, CS.textCentered, CS.textMedium)}
                >{t`This database doesn't have any tables.`}</h2>
              ) : (
                <BrowseGrid pt="lg">
                  {schemas.map((schema) => (
                    <BrowseCard
                      key={schema.id}
                      title={schema.name}
                      icon="folder"
                      to={`/browse/databases/${dbId}/schema/${encodeURIComponent(
                        schema.name,
                      )}`}
                    />
                  ))}
                </BrowseGrid>
              )}
            </>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
};

const DatabaseNameRedirect = ({ name }: { name: string }) => {
  const dispatch = useDispatch();
  const { data, isLoading } = useListDatabasesQuery();
  const database = findDatabaseByName(data?.data ?? [], name);

  useEffect(() => {
    if (database) {
      dispatch(replace(Urls.browseDatabase(database)));
    }
  }, [database, dispatch]);

  if (isLoading || database) {
    return <LoadingAndErrorWrapper loading />;
  }

  return <NotFound />;
};

export const BrowseSchemas = ({ params }: { params: { slug: string } }) => {
  const dbId = Urls.extractEntityId(params.slug);

  if (dbId == null) {
    return <DatabaseNameRedirect name={params.slug} />;
  }

  return <BrowseSchemasForDatabase dbId={dbId} params={params} />;
};

const BrowseSchemasForDatabase = ({
  dbId,
  params,
}: {
  dbId: number;
  params: { slug: string };
}) => {
  const { data, isLoading, error } = useListDatabaseSchemasQuery({ id: dbId });

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const schemas: Schema[] = (data ?? []).map((name) => ({ id: name, name }));
  return <BrowseSchemasContainer schemas={schemas} params={params} />;
};
