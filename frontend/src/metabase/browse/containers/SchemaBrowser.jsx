/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "ttag";

import Schema from "metabase/entities/schemas";
import Database from "metabase/entities/databases";

import Card from "metabase/components/Card";
import EntityItem from "metabase/components/EntityItem";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Tooltip from "metabase/components/Tooltip";

import TableBrowser from "metabase/browse/containers/TableBrowser";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import BrowseHeader from "metabase/browse/components/BrowseHeader";
import { ANALYTICS_CONTEXT, ITEM_WIDTHS } from "metabase/browse/constants";

function SchemaBrowser(props) {
  const { schemas, params } = props;
  const { slug } = params;
  const dbId = Urls.extractEntityId(slug);
  return (
    <Box>
      {schemas.length === 1 ? (
        <TableBrowser
          {...props}
          dbId={dbId}
          schemaName={schemas[0].name}
          // hide the schema since there's only one
          showSchemaInHeader={false}
        />
      ) : (
        <Box>
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
                <GridItem w={ITEM_WIDTHS} key={schema.id}>
                  <Link
                    to={`/browse/${dbId}/schema/${schema.name}`}
                    mb={1}
                    hover={{ color: color("accent2") }}
                    data-metabase-event={`${ANALYTICS_CONTEXT};Schema Click`}
                    className="overflow-hidden"
                  >
                    <Card hoverable px={1}>
                      <Flex align="center">
                        <EntityItem
                          name={schema.name}
                          iconName="folder"
                          iconColor={color("accent2")}
                          item={schema}
                        />
                        <Box ml="auto">
                          <Icon name="reference" />
                          <Tooltip tooltip={t`X-ray this schema`}>
                            <Icon name="bolt" mx={1} />
                          </Tooltip>
                        </Box>
                      </Flex>
                    </Card>
                  </Link>
                </GridItem>
              ))}
            </Grid>
          )}
        </Box>
      )}
    </Box>
  );
}

export default Schema.loadList({
  query: (state, { params: { slug } }) => ({
    dbId: Urls.extractEntityId(slug),
  }),
})(SchemaBrowser);
