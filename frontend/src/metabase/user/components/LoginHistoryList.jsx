import React, { Component } from "react";
import { Box, Flex } from "grid-styled";

import _ from "underscore";
import moment from "moment";

import LoginHistory from "metabase/entities/loginHistory";

import Card from "metabase/components/Card";
import Label from "metabase/components/type/Label";
import Text from "metabase/components/type/Text";
import Subhead from "metabase/components/type/Subhead";

const LoginHistoryItem = item => (
  <Card p={1} className="my2">
    <Flex align="center">
      <Box>
        <Label>{item.location}</Label>
        <Text>{item.ip_address}</Text>
        <Text color="medium">{item.device_description}</Text>
      </Box>
      <Flex align="right" ml="auto">
        {item.active && <Label className="pr2 text-data">Active</Label>}
        <Label>{item.time}</Label>
      </Flex>
    </Flex>
  </Card>
);

const LoginHistoryGroup = (items, date) => (
  <div className="py2">
    <Subhead>{date}</Subhead>
    <div>{items.map(LoginHistoryItem)}</div>
  </div>
);

const formatItems = items =>
  items.map(item => {
    const parsedTimestamp = moment.parseZone(item.timestamp);
    return {
      ...item,
      date: parsedTimestamp.format("LL"),
      time: `${parsedTimestamp.format("LT")} (${item.timezone ||
        parsedTimestamp.format("Z")})`,
    };
  });

@LoginHistory.loadList()
export default class LoginHistoryList extends Component {
  render() {
    const { loginHistory } = this.props;

    const items = formatItems(loginHistory);
    const groups = _.groupBy(items, item => item.date);

    return <div>{_.map(groups, LoginHistoryGroup)}</div>;
  }
}
