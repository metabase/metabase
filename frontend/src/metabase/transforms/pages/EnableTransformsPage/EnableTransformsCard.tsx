import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api/database";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { doesDatabaseSupportTransforms } from "metabase/transforms/utils";
import {
  Alert,
  Button,
  Card,
  Flex,
  Group,
  Icon,
  type IconName,
  Stack,
  Text,
  Title,
} from "metabase/ui";

export function EnableTransformsCard({
  onEnableClick,
  leftContent,
  loading,
}: {
  onEnableClick: () => void;
  leftContent?: React.ReactNode;
  loading?: boolean;
}) {
  const isAdmin = useSelector(getUserIsAdmin);
  const { data: databases } = useListDatabasesQuery();
  const hasDbThatSupportsTransforms =
    databases?.data.some(doesDatabaseSupportTransforms) ?? false;

  return (
    <Card withBorder maw="60rem" p={0} w="100%" style={{ overflow: "auto" }}>
      <Flex w="100%" p={{ xs: "2.5rem", xl: "3rem" }}>
        <Stack gap="lg" align="start" pt="xl" pl="lg">
          {leftContent ?? (
            <>
              <Title order={2}>{t`Customize and clean up your data`}</Title>
              <Text
                c="text-secondary"
                fz="1rem"
                lh={1.4}
              >{t`Transforms let you create new tables within your connected databases, helping you make nicer and more self-explanatory datasets for your end users to look at and explore.`}</Text>
              {isAdmin && (
                <Stack gap="lg" align="start">
                  <Text
                    c="text-secondary"
                    fz="1rem"
                    lh={1.4}
                    fw="bold"
                  >{t`Because transforms require write access to your database, make sure you know what you’re doing and that you understand the risks.`}</Text>
                  <Button
                    loading={loading}
                    variant="primary"
                    onClick={onEnableClick}
                  >{t`Enable transforms`}</Button>
                  {!hasDbThatSupportsTransforms && (
                    <Alert
                      color="warning"
                      variant="light"
                      icon={<Icon name="warning" size={16} />}
                      py="md"
                    >
                      {t`None of your connected databases have a writeable connection`}
                    </Alert>
                  )}
                </Stack>
              )}
            </>
          )}
        </Stack>
        <Stack flex="0 0 30%" ml="4rem">
          <SimpleCard
            icon="sql"
            title={t`Custom tables`}
            description={t`Create the tables your end users need with SQL queries`}
          />
          <SimpleCard
            icon="clock"
            title={t`Smart scheduling`}
            description={t`Tell your transforms when to run by assigning tags`}
          />
          <SimpleCard
            icon="eye"
            title={t`Observability`}
            description={t`See which transforms ran, and when`}
          />
          <SimpleCard
            icon="lock"
            title={t`Permissioned`}
            description={t`Control who can create and run transforms`}
          />
        </Stack>
      </Flex>
    </Card>
  );
}

const SimpleCard = ({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) => (
  <Card bg="background-secondary" shadow="none">
    <Group wrap="nowrap" align="start" gap="sm">
      <Icon name={icon} c="brand" size={16} flex="0 0 1rem" />
      <Stack gap="xs">
        <Text fw="bold" lh="1rem">
          {title}
        </Text>
        <Text fz="sm" lh="1rem">
          {description}
        </Text>
      </Stack>
    </Group>
  </Card>
);
