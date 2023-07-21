/* eslint-disable react/prop-types */
import _ from "underscore";
import moment from "moment-timezone";
import { t } from "ttag";

import Card from "metabase/components/Card";
import Label from "metabase/components/type/Label";
import Text from "metabase/components/type/Text";
import EmptyState from "metabase/components/EmptyState";
import NoResults from "assets/img/no_results.svg";

import {
  LoginActiveLabel,
  LoginGroup,
  LoginItemContent,
  LoginItemInfo,
} from "./LoginHistory.styled";

const LoginHistoryItem = ({ item }) => (
  <Card className="my2 py1" style={{ paddingLeft: 20, paddingRight: 20 }}>
    <LoginItemContent>
      <div>
        <Label mb="0">
          {item.location} -{" "}
          <span className="text-medium">{item.ip_address}</span>
        </Label>
        <Text style={{ marginTop: -8 }}>{item.device_description}</Text>
      </div>
      <LoginItemInfo>
        {item.active && (
          <LoginActiveLabel className="pr2">{t`Active`}</LoginActiveLabel>
        )}
        <Label>{item.time}</Label>
      </LoginItemInfo>
    </LoginItemContent>
  </Card>
);

const LoginHistoryGroup = ({ items, date }) => (
  <LoginGroup>
    <Label>{date}</Label>
    <div>
      {items.map(item => (
        <LoginHistoryItem key={item.timestamp} item={item} />
      ))}
    </div>
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

  return (
    <div>
      {_.map(groups, (items, date) => (
        <LoginHistoryGroup items={items} date={date} key={date} />
      ))}
    </div>
  );
}

export default LoginHistoryList;
