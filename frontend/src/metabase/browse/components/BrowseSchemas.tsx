import cx from "classnames";
import { t } from "ttag";

import TableBrowser from "metabase/browse/containers/TableBrowser";
import { BrowserCrumbs } from "metabase/components/BrowserCrumbs";
import Card from "metabase/components/Card";
import EntityItem from "metabase/components/EntityItem";
import { Grid } from "metabase/components/Grid";
import CS from "metabase/css/core/index.css";
import Database from "metabase/entities/databases";
import Schema from "metabase/entities/schemas";
import * as Urls from "metabase/lib/urls";
import type { CollectionItem } from "metabase-types/api";

import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
} from "./BrowseContainer.styled";
import { BrowseDataHeader } from "./BrowseDataHeader";
import { BrowseHeaderContent } from "./BrowseHeader.styled";
import { SchemaGridItem, SchemaLink } from "./BrowseSchemas.styled";

const BrowseSchemas = ({
  schemas,
  params,
}: {
  schemas: CollectionItem[];
  params: any;
}) => {
  const { slug } = params;
  const dbId = Urls.extractEntityId(slug);
  return (
    <BrowseContainer data-testid="browse-schemas">
      <BrowseDataHeader />
      <BrowseMain>
        <BrowseSection direction="column">
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
              <BrowseHeaderContent>
                <BrowserCrumbs
                  crumbs={[
                    { title: t`Databases`, to: "/browse/databases" },
                    { title: <Database.Name id={dbId} /> },
                  ]}
                />
              </BrowseHeaderContent>
              {schemas.length === 0 ? (
                <h2
                  className={cx(CS.full, CS.textCentered, CS.textMedium)}
                >{t`This database doesn't have any tables.`}</h2>
              ) : (
                <Grid>
                  {schemas.map(schema => (
                    <SchemaGridItem key={schema.id}>
                      <SchemaLink
                        to={`/browse/databases/${dbId}/schema/${encodeURIComponent(
                          schema.name,
                        )}`}
                      >
                        <Card hoverable className={CS.px1}>
                          <EntityItem
                            name={schema.name}
                            iconName="folder"
                            // TODO: Is it necessary to support this color?
                            // iconColor={color("accent2")}
                            item={schema}
                          />
                        </Card>
                      </SchemaLink>
                    </SchemaGridItem>
                  ))}
                </Grid>
              )}
            </>
          )}
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Schema.loadList({
  query: (state: any, { params: { slug } }: { params: { slug: string } }) => ({
    dbId: Urls.extractEntityId(slug),
  }),
})(BrowseSchemas);
