import React from "react";
import { Flex } from "grid-styled";
import { t, jt } from "c-3po";
import { formatNumber } from "metabase/lib/formatting";
import colors from "metabase/lib/colors";

import * as Query from "metabase/lib/query/query";
import * as Card from "metabase/meta/Card";
import { parseFieldBucketing, formatBucketing } from "metabase/lib/query_time";

export default class Smart extends React.Component {
  static uiName = "Smart Scalar";
  static identifier = "smartscalar";
  static iconName = "star";

  static minSize = { width: 3, height: 3 };

  static settings = {
    "scalar.locale": {
      title: t`Separator style`,
      widget: "select",
      props: {
        options: [
          { name: "100000.00", value: null },
          { name: "100,000.00", value: "en" },
          { name: "100 000,00", value: "fr" },
          { name: "100.000,00", value: "de" },
        ],
      },
      default: "en",
    },
    "scalar.decimals": {
      title: t`Number of decimal places`,
      widget: "number",
    },
    "scalar.switch_positive_negative": {
      title: t`Switch positive / negative colors?`,
      widget: "toggle",
    },
  };

  static isSensible() {
    return true;
  }

  render() {
    const insights =
      this.props.rawSeries &&
      this.props.rawSeries[0].data &&
      this.props.rawSeries[0].data.insights;
    const { isDashboard, card, settings } = this.props;

    let granularity;
    if (Card.isStructured(card)) {
      const query = Card.getQuery(card);
      const breakouts = query && Query.getBreakouts(query);
      granularity = formatBucketing(parseFieldBucketing(breakouts[0]));
    }

    const change = formatNumber(insights["last-change"] * 100);
    const isNegative = (change && Math.sign(change) < 0) || false;

    let color = isNegative ? colors["error"] : colors["success"];

    // if the number is negative but thats been identified as a good thing (e.g. decreased latency somehow?)
    if (isNegative && settings["scalar.switch_positive_negative"]) {
      color = colors["success"];
    } else if (!isNegative && settings["scalar.switch_positive_negative"]) {
      color = colors["error"];
    }

    const changeDisplay = <span style={{ color }}>{change}%</span>;

    const granularityDisplay = (
      <span
        style={{ fontSize: "0.98em", letterSpacing: 1.02 }}
      >{jt`past ${granularity}`}</span>
    );

    const formatOptions = {
      decimalPlaces: settings["scalar.decimals"],
    };

    return (
      <Flex
        align="center"
        justify="center"
        flexDirection="column"
        className="full-height full"
        flex={1}
        style={{ fontSize: isDashboard ? "1rem" : "2rem", flexWrap: "wrap" }}
      >
        <h1 style={{ fontSize: "2em", fontWeight: 900, lineHeight: 1 }}>
          {formatNumber(insights["last-value"], formatOptions)}
        </h1>
        <Flex align="center" mt={1} flexWrap="wrap">
          <h4
            style={{
              fontWeight: 900,
              textTransform: "uppercase",
              color: colors["text-medium"],
              fontSize: isDashboard ? "0.8em" : "0.68em",
            }}
          >
            {jt`${changeDisplay} (${formatNumber(
              insights["previous-value"],
              formatOptions,
            )} ${granularityDisplay})`}
          </h4>
        </Flex>
      </Flex>
    );
  }
}
