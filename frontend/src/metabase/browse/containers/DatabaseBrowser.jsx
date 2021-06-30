/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "ttag";
import _ from "underscore";

import Database from "metabase/entities/databases";
import Questions from "metabase/entities/questions";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import BrowseHeader from "metabase/browse/components/BrowseHeader";

import { ANALYTICS_CONTEXT, ITEM_WIDTHS } from "metabase/browse/constants";

function DatabaseBrowser({ databases, questions: cards }) {
  const modelishCards = cards.filter(card => {
    return card.name.startsWith("MODEL: ");
  });

  return (
    <Box>
      <Box>
        <Box mt={3} mb={2}>
          <h5
            className="text-uppercase text-medium"
            style={{ fontWeight: 900 }}
          >
            {t`Models`}
          </h5>
        </Box>

        <Grid>
          {modelishCards.map(model => (
            <GridItem w={ITEM_WIDTHS} key={model.id}>
              <Link
                to={Urls.question(model)}
                data-metabase-event={`${ANALYTICS_CONTEXT};Model Click`}
                display="block"
                hover={{ color: color("brand") }}
              >
                <Card p={3} hover={{ color: color("brand") }}>
                  <Icon
                    name="model"
                    color={color("accent2")}
                    mb={3}
                    size={28}
                  />
                  <h3 className="text-wrap">{model.name}</h3>
                </Card>
              </Link>
            </GridItem>
          ))}
        </Grid>
      </Box>
      <Box>
        <BrowseHeader crumbs={[{ title: t`Raw data` }]} />

        <Grid>
          {databases.map(database => (
            <GridItem w={ITEM_WIDTHS} key={database.id}>
              <Link
                to={Urls.browseDatabase(database)}
                data-metabase-event={`${ANALYTICS_CONTEXT};Database Click`}
                display="block"
                hover={{ color: color("brand") }}
              >
                <Card p={3} hover={{ color: color("brand") }}>
                  <Icon
                    name="database"
                    color={color("accent2")}
                    mb={3}
                    size={28}
                  />
                  <h3 className="text-wrap">{database.name}</h3>
                </Card>
              </Link>
            </GridItem>
          ))}
        </Grid>
      </Box>
    </Box>
  );
}

export default _.compose(
  Database.loadList(),
  Questions.loadList({ query: { f: "all" } }),
)(DatabaseBrowser);
