import cx from "classnames";
import dayjs from "dayjs";
import { t } from "ttag";
import _ from "underscore";

import NoResults from "assets/img/no_results.svg";
import { Card } from "metabase/common/components/Card";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Label } from "metabase/common/components/type/Label";
import { Text } from "metabase/common/components/type/Text";
import CS from "metabase/css/core/index.css";
import type { UserLoginHistoryItem } from "metabase-types/api";

import {
  LoginActiveLabel,
  LoginGroup,
  LoginItemContent,
  LoginItemInfo,
} from "./LoginHistory.styled";

interface FormattedLoginItem extends UserLoginHistoryItem {
  date: string;
  time: string;
}

const LoginHistoryItem = ({ item }: { item: FormattedLoginItem }) => (
  <Card
    className={cx(CS.my2, CS.py1)}
    style={{ paddingLeft: 20, paddingRight: 20 }}
  >
    <LoginItemContent>
      <div>
        <Label>
          {item.location} -{" "}
          <span className={CS.textMedium}>{item.ip_address}</span>
        </Label>
        <Text style={{ marginTop: -8 }}>{item.device_description}</Text>
      </div>
      <LoginItemInfo>
        {item.active && (
          <LoginActiveLabel className={CS.pr2}>{t`Active`}</LoginActiveLabel>
        )}
        <Label>{item.time}</Label>
      </LoginItemInfo>
    </LoginItemContent>
  </Card>
);

const LoginHistoryGroup = ({
  items,
  date,
}: {
  items: FormattedLoginItem[];
  date: string;
}) => (
  <LoginGroup>
    <Label>{date}</Label>
    <div>
      {items.map((item) => (
        <LoginHistoryItem key={item.timestamp} item={item} />
      ))}
    </div>
  </LoginGroup>
);

const formatItems = (items: UserLoginHistoryItem[]): FormattedLoginItem[] =>
  items.map((item) => {
    const parsedTimestamp = dayjs.parseZone(item.timestamp);
    return {
      ...item,
      date: parsedTimestamp.format("LL"),
      time: `${parsedTimestamp.format("LT")} (${item.timezone || parsedTimestamp.format("Z")})`,
    };
  });

function LoginHistoryList({
  loginHistory = [],
}: {
  loginHistory?: UserLoginHistoryItem[];
}) {
  const items = formatItems(loginHistory);
  const groups = _.groupBy(items, (item) => item.date);

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LoginHistoryList;
