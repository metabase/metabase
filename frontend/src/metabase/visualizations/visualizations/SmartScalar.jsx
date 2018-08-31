import React from "react";
import { Box, Flex } from "grid-styled";
import SmartScalar from "metabase/visualizations/components/SmartScalar";
import { t } from "c-3po";
import { formatNumber } from "metabase/lib/formatting";
import colors from "metabase/lib/colors";

import * as Query from "metabase/lib/query/query";
import * as Card from "metabase/meta/Card";
import { parseFieldBucketing, formatBucketing } from "metabase/lib/query_time";

export default class Smart extends React.Component {
  static uiName = "Smart Scalar";
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
    const { isDashboard, card, gridSize } = this.props;

    let granularity;
    if (Card.isStructured(card)) {
      const query = Card.getQuery(card);
      const breakouts = query && Query.getBreakouts(query);
      granularity = formatBucketing(parseFieldBucketing(breakouts[0]));
    }

    const shouldBeVertical = gridSize && gridSize.height > gridSize.width;
    return (
      <Flex
        align="center"
        justify="center"
        className="full-height full"
        flex={1}
        style={{ fontSize: isDashboard ? "1rem" : "2rem", flexWrap: "wrap" }}
        m={2}
        flexWrap="wrap"
      >
        <Flex
          flexDirection={shouldBeVertical ? "column" : "row"}
          style={{ flexWrap: "wrap" }}
        >
          <Flex style={{ alignSelf: "flex-end" }}>
            <Box>
              <h4
                style={{
                  fontWeight: 900,
                  textTransform: "uppercase",
                  color: colors["text-medium"],
                  fontSize: 11,
                  letterSpacing: 0.24,
                }}
              >
                {t`Most recent ${granularity}`}
              </h4>
              <h1 style={{ fontSize: "2em", fontWeight: 900, lineHeight: 1 }}>
                {formatNumber(insights["last-value"])}
              </h1>
            </Box>
            <Box mt="auto">
              <SmartScalar change={insights["last-change"] * 100} />
            </Box>
          </Flex>
          <Box
            ml={shouldBeVertical ? 0 : 3}
            mt={shouldBeVertical ? 3 : 0}
            style={{ alignSelf: shouldBeVertical ? "flex-start" : "flex-end" }}
          >
            <SmartScalar
              title={`Previous ${granularity}`}
              value={insights["previous-value"]}
            />
          </Box>
        </Flex>
      </Flex>
    );
  }
}
