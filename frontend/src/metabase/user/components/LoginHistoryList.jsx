/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";

import _ from "underscore";
import moment from "moment";

import LoginHistory from "metabase/entities/loginHistory";

import Card from "metabase/components/Card";
import Label from "metabase/components/type/Label";
import Text from "metabase/components/type/Text";

const LoginHistoryItem = item => (
  <Card py={1} px="20px" my={2}>
    <Flex align="center">
      <Box>
        <Label mb="0">
          {item.location} -{" "}
          <span className="text-medium">{item.ip_address}</span>
        </Label>
        <Text color="medium" mt="-2px">
          {item.device_description}
        </Text>
      </Box>
      <Flex ml="auto">
        {item.active && (
          <Label pr={2} className="text-data">
            Active
          </Label>
        )}
        <Label>{item.time}</Label>
      </Flex>
    </Flex>
  </Card>
);

const LoginHistoryGroup = (items, date) => (
  <Box py={2}>
    <Label>{date}</Label>
    <Box>{items.map(LoginHistoryItem)}</Box>
  </Box>
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

function LoginHistoryList({ loginHistory }) {
  const items = formatItems(loginHistory);
  const groups = _.groupBy(items, item => item.date);

  return <Box>{_.map(groups, LoginHistoryGroup)}</Box>;
}

export default LoginHistory.loadList()(LoginHistoryList);
