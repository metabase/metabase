/* eslint-disable react/prop-types */
import { t } from "ttag";

import Schema from "metabase/entities/schemas";
import Database from "metabase/entities/databases";

import Card from "metabase/components/Card";
import EntityItem from "metabase/components/EntityItem";
import { Grid } from "metabase/components/Grid";

import TableBrowser from "metabase/browse/containers/TableBrowser";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import BrowserCrumbs from "metabase/components/BrowserCrumbs";
import {
  SchemaBrowserContainer,
  SchemaGridItem,
  SchemaLink,
} from "./SchemaBrowser.styled";
import { BrowseHeaderContent } from "./BrowseHeader.styled";

function SchemaBrowser(props) {
  const { schemas, params } = props;
  const { slug } = params;
  const dbId = Urls.extractEntityId(slug);
  return (
    <SchemaBrowserContainer>
      {schemas.length === 1 ? (
        <TableBrowser
          {...props}
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
            <h2 className="full text-centered text-medium">{t`This database doesn't have any tables.`}</h2>
          ) : (
            <Grid>
              {schemas.map(schema => (
                <SchemaGridItem key={schema.id}>
                  <SchemaLink
                    to={`/browse/databases/${dbId}/schema/${encodeURIComponent(
                      schema.name,
                    )}`}
                  >
                    <Card hoverable className="px1">
                      <EntityItem
                        name={schema.name}
                        iconName="folder"
                        iconColor={color("accent2")}
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
    </SchemaBrowserContainer>
  );
}

export default Schema.loadList({
  query: (state, { params: { slug } }) => ({
    dbId: Urls.extractEntityId(slug),
  }),
})(SchemaBrowser);
