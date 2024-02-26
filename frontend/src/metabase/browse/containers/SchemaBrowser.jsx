/* eslint-disable react/prop-types */
import { t } from "ttag";

import BrowseHeader from "metabase/browse/components/BrowseHeader";
import { ANALYTICS_CONTEXT } from "metabase/browse/constants";
import TableBrowser from "metabase/browse/containers/TableBrowser";
import Card from "metabase/components/Card";
import EntityItem from "metabase/components/EntityItem";
import { Grid } from "metabase/components/Grid";
import Database from "metabase/entities/databases";
import Schema from "metabase/entities/schemas";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import { SchemaGridItem, SchemaLink } from "./SchemaBrowser.styled";

function SchemaBrowser(props) {
  const { schemas, params } = props;
  const { slug } = params;
  const dbId = Urls.extractEntityId(slug);
  return (
    <div>
      {schemas.length === 1 ? (
        <TableBrowser
          {...props}
          dbId={dbId}
          schemaName={schemas[0].name}
          // hide the schema since there's only one
          showSchemaInHeader={false}
        />
      ) : (
        <div>
          <BrowseHeader
            crumbs={[
              { title: t`Our data`, to: "browse" },
              { title: <Database.Name id={dbId} /> },
            ]}
          />
          {schemas.length === 0 ? (
            <h2 className="full text-centered text-medium">{t`This database doesn't have any tables.`}</h2>
          ) : (
            <Grid>
              {schemas.map(schema => (
                <SchemaGridItem key={schema.id}>
                  <SchemaLink
                    to={`/browse/${dbId}/schema/${encodeURIComponent(
                      schema.name,
                    )}`}
                    data-metabase-event={`${ANALYTICS_CONTEXT};Schema Click`}
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
        </div>
      )}
    </div>
  );
}

export default Schema.loadList({
  query: (state, { params: { slug } }) => ({
    dbId: Urls.extractEntityId(slug),
  }),
})(SchemaBrowser);
