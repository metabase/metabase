/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Database from "metabase/entities/databases";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import Card from "metabase/components/Card";
import { Grid } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";

import BrowseHeader from "metabase/browse/components/BrowseHeader";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";
import { DatabaseGridItem } from "./DatabaseBrowser.styled";

function DatabaseBrowser({ databases }) {
  return (
    <div data-testid="database-browser">
      <BrowseHeader crumbs={[{ title: t`Our data` }]} />

      <Grid>
        {databases.map(database => (
          <DatabaseGridItem key={database.id}>
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
          </DatabaseGridItem>
        ))}
      </Grid>
    </div>
  );
}

export default Database.loadList()(DatabaseBrowser);
