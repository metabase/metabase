import cx from "classnames";
import { t } from "ttag";

import TableBrowser from "metabase/browse/containers/TableBrowser";
import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import CS from "metabase/css/core/index.css";
import { Databases } from "metabase/entities/databases";
import { Schemas } from "metabase/entities/schemas";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type { CollectionItem } from "metabase-types/api";

import { BrowseCard } from "../components/BrowseCard";
import S from "../components/BrowseContainer.module.css";
import { BrowseDataHeader } from "../components/BrowseDataHeader";
import { BrowseGrid } from "../components/BrowseGrid";

const BrowseSchemasContainer = ({
  schemas,
  params,
}: {
  schemas: CollectionItem[];
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
              schemas={schemas}
              params={params}
              slug={slug}
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
                    { title: <Databases.Name id={dbId} /> },
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

export const BrowseSchemas = Schemas.loadList({
  query: (state: any, { params: { slug } }: { params: { slug: string } }) => ({
    dbId: Urls.extractEntityId(slug),
  }),
})(BrowseSchemasContainer);
