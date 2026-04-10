import dayjs from "dayjs";
import { t } from "ttag";
import _ from "underscore";

import NoResults from "assets/img/no_results.svg";
import { Card } from "metabase/common/components/Card";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Label } from "metabase/common/components/type/Label";
import { Box, Flex, Text, rem } from "metabase/ui";
import type { UserLoginHistoryItem } from "metabase-types/api";

interface FormattedLoginItem extends UserLoginHistoryItem {
  date: string;
  time: string;
}

const LoginHistoryItem = ({ item }: { item: FormattedLoginItem }) => (
  <Box my="sm">
    <Card>
      <Flex align="center" py="xs" px={rem(20)}>
        <Box>
          <Label>
            {item.location} -{" "}
            <Text component="span" c="text-secondary">
              {item.ip_address}
            </Text>
          </Label>
          <Text mt={-8}>{item.device_description}</Text>
        </Box>
        <Flex ml="auto">
          {item.active && (
            <Label c="summarize" pr="sm">{t`Active`}</Label>
          )}
          <Label>{item.time}</Label>
        </Flex>
      </Flex>
    </Card>
  </Box>
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

  if (!items.length) {
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
