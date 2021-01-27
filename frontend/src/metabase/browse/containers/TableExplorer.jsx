import React from "react";
import { Box, Flex } from "grid-styled";
import { connect } from "react-redux";
import { getMetadata } from "metabase/selectors/metadata";

import Table from "metabase/entities/tables";
import Segment from "metabase/entities/segments";
import Metric from "metabase/entities/metrics";
import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import Visualization from "metabase/visualizations/components/Visualization";

import Card from "metabase/components/Card";
import Button from "metabase/components/Button";
import Link from "metabase/components/Link";

function TableExplorer({ table, metadata }) {
  const metadataTable = metadata.table(table.id);
  const question =
    metadataTable &&
    // NOTE: don't clean since we might not have all the metadata loaded?
    metadataTable.newQuestion();

  return (
    <Box w="100%" bg="white">
      <Flex p={3} mt={3} align="center">
        <Box px={2}>
          <h1>{table.display_name}</h1>
          <p>
            {table.description ? (
              table.description
            ) : (
              <Link>Add a description</Link>
            )}
          </p>
        </Box>
        <Link to={question.getUrl({ clean: false })} ml="auto">
          <Button>Start a question</Button>
        </Link>
      </Flex>
      <QuestionResultLoader question={question}>
        {({ rawSeries, result }) => (
          <Card style={{ height: 400 }} my={2} mx={3}>
            <Visualization rawSeries={rawSeries} />
          </Card>
        )}
      </QuestionResultLoader>
    </Box>
  );
}

export default Table.load({
  id: (state, props) => props.params.tableId,
})(
  connect(state => ({
    metadata: getMetadata(state),
  }))(TableExplorer),
);
