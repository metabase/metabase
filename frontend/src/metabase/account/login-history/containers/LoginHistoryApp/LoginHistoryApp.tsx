import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Card, Flex, Repeat, Skeleton, Stack } from "metabase/ui";

import { useGetLoginHistoryQuery } from "../../../api/login-history";
import LoginHistoryList from "../../components/LoginHistory";

const SKELETON_LOGINS_PER_DAY = 3;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function LoginHistoryApp() {
  const { data: loginHistory, error, isLoading } = useGetLoginHistoryQuery();

  if (isLoading || error) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error}
        loader={<LoginHistorySkeleton />}
      />
    );
  }

  return <LoginHistoryList loginHistory={loginHistory} />;
}

function LoginHistorySkeleton() {
  return (
    <Box py="lg">
      <Skeleton h={14} w={140} radius="xs" mb="md" />
      <Repeat times={SKELETON_LOGINS_PER_DAY}>
        <Card px="lg" py="sm" my="lg" radius="sm" withBorder>
          <Flex align="flex-start" justify="space-between">
            <Stack gap="sm" py="xs">
              <Skeleton h={14} w={160} radius="xs" />
              <Skeleton h={14} w={110} radius="xs" />
              <Skeleton h={12} w={220} radius="xs" />
            </Stack>
            <Skeleton h={14} w={120} radius="xs" mt="xs" />
          </Flex>
        </Card>
      </Repeat>
    </Box>
  );
}
