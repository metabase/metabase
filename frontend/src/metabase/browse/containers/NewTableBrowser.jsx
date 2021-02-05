import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { Box } from "grid-styled";

import { getXraysEnabled } from "metabase/selectors/settings";
import { getMetadata } from "metabase/selectors/metadata";

import Table from "metabase/entities/tables";
import Segment from "metabase/entities/segments";

import { color } from "metabase/lib/colors";

import Card from "metabase/components/Card";
import Database from "metabase/entities/databases";
import EntityItem from "metabase/components/EntityItem";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import BrowseHeader from "metabase/browse/components/BrowseHeader";
import { ANALYTICS_CONTEXT, ITEM_WIDTHS } from "metabase/browse/constants";

function TableBrowser(props) {
  const {
    tables,
    metadata,
    params: { dbId, schemaName },
    showSchemaInHeader = true,
    setDetail,
  } = props;
  return (
    <Box>
      <h4 className="text-medium">{schemaName}</h4>
      <div className="mt2 px2">
        {tables.map(table => {
          // NOTE: currently tables entities doesn't integrate with Metadata objects
          const metadataTable = metadata.table(table.id);
          const link =
            metadataTable &&
            // NOTE: don't clean since we might not have all the metadata loaded?
            metadataTable.newQuestion().getUrl({ clean: false });
          return (
            <Box className="hover-parent hover--visibility" key={table.id}>
              <div
                className="flex align-center border-bottom py2 text-brand-hover"
                onClick={() => setDetail(table)}
              >
                <div>
                  <h3 className="mb0">{table.display_name}</h3>
                  {table.description && (
                    <p className="my0">{table.description}</p>
                  )}
                </div>
                <div className="flex align-center ml-auto">
                  <Segment.ListLoader>
                    {({ list }) => {
                      const hasSegments =
                        list.filter(l => l.table_id === table.id).length > 0;
                      return hasSegments ? <Icon name="segment" /> : null;
                    }}
                  </Segment.ListLoader>
                  <Link
                    to={link}
                    data-metabase-event={`${ANALYTICS_CONTEXT};Table Click`}
                    className="block overflow-hidden hover-child"
                  >
                    Query
                  </Link>
                </div>
              </div>
            </Box>
          );
        })}
      </div>
    </Box>
  );
}

export default Table.loadList({
  query: (state, { params: { dbId, schemaName } }) => ({
    dbId,
    schemaName,
  }),
})(
  connect(state => ({
    metadata: getMetadata(state),
    xraysEnabled: getXraysEnabled(state),
  }))(TableBrowser),
);
