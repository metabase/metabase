/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";
import moment from "moment";
import { t } from "ttag";

import Card from "metabase/components/Card";
import Label from "metabase/components/type/Label";
import Text from "metabase/components/type/Text";
import EmptyState from "metabase/components/EmptyState";
import NoResults from "assets/img/no_results.svg";

import {
  LoginGroup,
  LoginItemContent,
  LoginItemInfo,
} from "./LoginHistory.styled";

const LoginHistoryItem = item => (
  <Card py={1} px="20px" my={2}>
    <LoginItemContent>
      <div>
        <Label mb="0">
          {item.location} -{" "}
          <span className="text-medium">{item.ip_address}</span>
        </Label>
        <Text color="medium" mt="-2px">
          {item.device_description}
        </Text>
      </div>
      <LoginItemInfo>
        {item.active && (
          <Label pr={2} className="text-data">
            Active
          </Label>
        )}
        <Label>{item.time}</Label>
      </LoginItemInfo>
    </LoginItemContent>
  </Card>
);

const LoginHistoryGroup = (items, date) => (
  <LoginGroup>
    <Label>{date}</Label>
    <div>{items.map(LoginHistoryItem)}</div>
  </LoginGroup>
);

const formatItems = items =>
  items.map(item => {
    const parsedTimestamp = moment.parseZone(item.timestamp);
    return {
      ...item,
      date: parsedTimestamp.format("LL"),
      time: `${parsedTimestamp.format("LT")} (${
        item.timezone || parsedTimestamp.format("Z")
      })`,
    };
  });

function LoginHistoryList({ loginHistory }) {
  const items = formatItems(loginHistory);
  const groups = _.groupBy(items, item => item.date);

  if (!items || !items.length) {
    return (
      <EmptyState
        title={t`No logins`}
        illustrationElement={<img src={NoResults} />}
      />
    );
  }

  return <div>{_.map(groups, LoginHistoryGroup)}</div>;
}

export default LoginHistoryList;
