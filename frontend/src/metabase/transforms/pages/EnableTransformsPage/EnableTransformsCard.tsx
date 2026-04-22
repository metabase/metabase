import { jt, t } from "ttag";

import { useListDatabasesQuery } from "metabase/api/database";
import { Link } from "metabase/common/components/Link";
import { getPlan } from "metabase/common/utils/plan";
import { getSetting } from "metabase/selectors/settings";
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
import { useSelector } from "metabase/utils/redux";

export function EnableTransformsCard({
  onEnableClick,
  permissionsErrorMessage,
  finePrint,
  leftContent,
  loading,
}: {
  onEnableClick: () => void;
  permissionsErrorMessage?: React.ReactNode;
  finePrint?: React.ReactNode;
  leftContent?: React.ReactNode;
  loading?: boolean;
}) {
  const { data: databases } = useListDatabasesQuery();
  const hasDbThatSupportsTransforms =
    databases?.data.some(doesDatabaseSupportTransforms) ?? false;
  const plan = useSelector((state) =>
    getPlan(getSetting(state, "token-features")),
  );
  const permissionsDescription =
    plan === "pro-self-hosted"
      ? t`Only Analysts and Admins can create and run transforms`
      : t`Only Admins can create and run transforms`;

  return (
    <Card withBorder maw="60rem" p={0} w="100%" style={{ overflow: "auto" }}>
      <Flex w="100%" p={{ xs: "2.5rem", xl: "3rem" }}>
        <Stack gap="lg" align="start" pt="xl" pl="lg" flex="1 1 auto">
          {leftContent ?? (
            <>
              <Title order={2}>{t`Customize and clean up your data`}</Title>
              <Text
                c="text-secondary"
                fz="1rem"
                lh={1.4}
              >{t`Transforms let you create new tables within your connected databases, helping you make nicer and more self-explanatory datasets for your end users to look at and explore.`}</Text>
              {permissionsErrorMessage || (
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
                  {finePrint && (
                    <Text c="text-secondary" lh={1.4} maw="28rem">
                      {finePrint}
                    </Text>
                  )}
                  {!hasDbThatSupportsTransforms && (
                    <Alert
                      color="warning"
                      variant="light"
                      icon={<Icon name="warning" size={16} />}
                      title={t`No writable database connection`}
                    >
                      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Only admins can see this */}
                      {jt`Transforms create tables in your database, so Metabase needs write access. ${(
                        <Link
                          key="link"
                          to="/admin/databases"
                          style={{ textDecoration: "underline" }}
                        >{t`Reconnect or add a connection`}</Link>
                      )} with a user that has the right privileges.`}
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
            description={permissionsDescription}
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
