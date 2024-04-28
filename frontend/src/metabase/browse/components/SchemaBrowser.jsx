/* eslint-disable react/prop-types */
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
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import { BrowseHeaderContent } from "./BrowseHeader.styled";
import {
  SchemaBrowserContainer,
  SchemaGridItem,
  SchemaLink,
} from "./SchemaBrowser.styled";

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
