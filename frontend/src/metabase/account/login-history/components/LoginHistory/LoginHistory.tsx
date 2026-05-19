import cx from "classnames";
import dayjs from "dayjs";
import { t } from "ttag";
import _ from "underscore";

import NoResults from "assets/img/no_results.svg";
import { Card } from "metabase/common/components/Card";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Label } from "metabase/common/components/type/Label";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Text } from "metabase/ui";
import type { UserLoginHistoryItem } from "metabase-types/api";

interface FormattedLoginItem extends UserLoginHistoryItem {
  date: string;
  time: string;
}

const LoginHistoryItem = ({ item }: { item: FormattedLoginItem }) => (
  <Card
    className={cx(CS.my2, CS.py1)}
    style={{ paddingLeft: 20, paddingRight: 20 }}
  >
    <Flex align="flex-start">
      <div>
        <Label>
          {item.location}
          <Text component="span" display="block" className={CS.textMedium}>
            {item.ip_address}
          </Text>
        </Label>
        <Text style={{ marginTop: -8 }}>{item.device_description}</Text>
      </div>
      <Flex ml="auto">
        {item.active && (
          <Label c="summarize" className={CS.pr2}>{t`Active`}</Label>
        )}
        <Label>{item.time}</Label>
      </Flex>
    </Flex>
  </Card>
);

const LoginHistoryGroup = ({
  items,
  date,
}: {
  items: FormattedLoginItem[];
  date: string;
}) => (
  <Box py="md">
    <Label>{date}</Label>
    <div>
      {items.map((item) => (
        <LoginHistoryItem key={item.timestamp} item={item} />
      ))}
    </div>
  </Box>
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
