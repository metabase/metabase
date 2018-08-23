import React from "react";
import { Box, Flex } from "grid-styled";
import SmartScalar from "metabase/visualizations/components/SmartScalar";
import { t } from "c-3po";
import { formatNumber } from "metabase/lib/formatting";

import * as Query from "metabase/lib/query/query";
import * as Card from "metabase/meta/Card";
import { parseFieldBucketing, formatBucketing } from "metabase/lib/query_time";

export default class Smart extends React.Component {
  static uiName = "Change";
  static identifier = "SmartScalar";
  static iconName = "star";

  static minSize = { width: 3, height: 3 };

  static isSensible() {
    return true;
  }

  render() {
    const insights =
      this.props.rawSeries &&
      this.props.rawSeries[0].data &&
      this.props.rawSeries[0].data.insights;
    const { isDashboard, card } = this.props;

    let granularity;
    if (Card.isStructured(card)) {
      const query = Card.getQuery(card);
      const breakouts = query && Query.getBreakouts(query);
      granularity = formatBucketing(parseFieldBucketing(breakouts[0]));
    }

    return isDashboard ? (
      <DashCardRendering
        {...this.props}
        granularity={granularity}
        insights={insights}
      />
    ) : (
      <QueryBuilderRendering
        {...this.props}
        granularity={granularity}
        insights={insights}
      />
    );
  }
}

const QueryBuilderRendering = ({ granularity, insights }) => (
  <Flex
    align="center"
    justify="center"
    flexDirection="column"
    className="full-height full"
  >
    <Box>
      <h1 style={{ fontSize: 64, fontWeight: 900 }}>
        {formatNumber(insights["last-value"])}
      </h1>
      <h3>{t`Most recent ${granularity}`}</h3>
      <Flex align="center" my={3}>
        <SmartScalar title={`Change`} change={insights["last-change"] * 100} />
        <Box mx={2}>
          <SmartScalar
            title={`Previous ${granularity}`}
            value={insights["previous-value"]}
          />
        </Box>
      </Flex>
    </Box>
  </Flex>
);

const DashCardRendering = ({ granularity, insights }) => (
  <Flex
    align="center"
    justify="center"
    flexDirection="column"
    className="full-height full"
    flex={1}
  >
    <Box>
      <h1 style={{ fontSize: "2rem", fontWeight: 900 }}>
        {formatNumber(insights["last-value"])}
      </h1>
      <h3>{t`Most recent ${granularity}`}</h3>
      <Flex align="center" my={3}>
        <SmartScalar title={`Change`} change={insights["last-change"] * 100} />
        <Box mx={2}>
          <SmartScalar
            title={`Previous ${granularity}`}
            value={insights["previous-value"]}
          />
        </Box>
      </Flex>
    </Box>
  </Flex>
);
