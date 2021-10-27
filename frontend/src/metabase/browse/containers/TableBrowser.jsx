import React, { Fragment } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import { Box } from "grid-styled";
import { getXraysEnabled } from "metabase/selectors/settings";
import { getMetadata } from "metabase/selectors/metadata";
import Table from "metabase/entities/tables";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/saved-questions";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import Card from "metabase/components/Card";
import Database from "metabase/entities/databases";
import EntityItem from "metabase/components/EntityItem";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import BrowseHeader from "metabase/browse/components/BrowseHeader";
import { ANALYTICS_CONTEXT, ITEM_WIDTHS } from "metabase/browse/constants";

const TableBrowser = ({
  tables,
  metadata,
  dbId,
  schemaName,
  xraysEnabled,
  showSchemaInHeader = true,
}) => (
  <Box>
    <BrowseHeader
      crumbs={[
        { title: t`Our data`, to: "browse" },
        getDatabaseCrumbs(dbId),
        showSchemaInHeader && { title: schemaName },
      ]}
    />
    <Grid>
      {tables.map(table => (
        <GridItem width={ITEM_WIDTHS} key={table.id}>
          <Card
            hoverable={table.active}
            px={1}
            className="hover-parent hover--visibility"
          >
            {table.active ? (
              <Link
                to={getTableLink(table, metadata)}
                ml={1}
                data-metabase-event={`${ANALYTICS_CONTEXT};Table Click`}
                className="block overflow-hidden"
              >
                <TableBrowserItem
                  dbId={dbId}
                  table={table}
                  xraysEnabled={xraysEnabled}
                />
              </Link>
            ) : (
              <Box ml={1} className="block overflow-hidden">
                <TableBrowserItem
                  dbId={dbId}
                  table={table}
                  xraysEnabled={xraysEnabled}
                />
              </Box>
            )}
          </Card>
        </GridItem>
      ))}
    </Grid>
  </Box>
);

TableBrowser.propTypes = {
  tables: PropTypes.array.isRequired,
  metadata: PropTypes.object.isRequired,
  dbId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  schemaName: PropTypes.string,
  xraysEnabled: PropTypes.bool,
  showSchemaInHeader: PropTypes.bool,
};

const TableBrowserItem = ({ dbId, table, xraysEnabled }) => (
  <EntityItem
    item={table}
    name={table.display_name || table.name}
    iconName="table"
    iconColor={color("accent2")}
    loading={!table.active}
    disabled={!table.active}
    buttons={
      table.active && (
        <TableBrowserItemButtons
          dbId={dbId}
          table={table}
          xraysEnabled={xraysEnabled}
        />
      )
    }
  />
);

TableBrowserItem.propTypes = {
  table: PropTypes.object.isRequired,
  dbId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  xraysEnabled: PropTypes.bool,
};

const TableBrowserItemButtons = ({ dbId, table, xraysEnabled }) => (
  <Fragment>
    {xraysEnabled && (
      <Link
        to={`auto/dashboard/table/${table.id}`}
        data-metabase-event={`${ANALYTICS_CONTEXT};Table Item;X-ray Click`}
        className="link--icon ml1"
      >
        <Icon
          key="xray"
          tooltip={t`X-ray this table`}
          name="bolt"
          color={color("warning")}
          size={20}
          className="hover-child"
        />
      </Link>
    )}
    <Link
      to={`reference/databases/${dbId}/tables/${table.id}`}
      data-metabase-event={`${ANALYTICS_CONTEXT};Table Item;Reference Click`}
      className="link--icon ml1"
    >
      <Icon
        key="reference"
        tooltip={t`Learn about this table`}
        name="reference"
        color={color("text-medium")}
        className="hover-child"
      />
    </Link>
  </Fragment>
);

TableBrowserItemButtons.propTypes = {
  table: PropTypes.object.isRequired,
  dbId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  xraysEnabled: PropTypes.bool,
};

const getDatabaseCrumbs = dbId => {
  if (dbId === SAVED_QUESTIONS_VIRTUAL_DB_ID) {
    return {
      title: t`Saved Questions`,
      to: Urls.browseDatabase({ id: SAVED_QUESTIONS_VIRTUAL_DB_ID }),
    };
  } else {
    return {
      title: <Database.Link id={dbId} />,
    };
  }
};

const getTableLink = (table, metadata) => {
  const metadataTable = metadata.table(table.id);
  return metadataTable?.newQuestion().getUrl({ clean: false });
};

const getDatabaseId = props => {
  const { params } = props;
  const dbId =
    parseInt(props.dbId) ||
    parseInt(params.dbId) ||
    Urls.extractEntityId(params.slug);
  return Number.isSafeInteger(dbId) ? dbId : undefined;
};

const getSchemaName = props => {
  return props.schemaName || props.params.schemaName;
};

const mapStateToProps = (state, props) => {
  return {
    dbId: getDatabaseId(props),
    schemaName: getSchemaName(props),
    metadata: getMetadata(state),
    xraysEnabled: getXraysEnabled(state),
  };
};

export default Table.loadList({
  query: (state, props) => ({
    dbId: getDatabaseId(props),
    schemaName: getSchemaName(props),
  }),
})(connect(mapStateToProps)(TableBrowser));
