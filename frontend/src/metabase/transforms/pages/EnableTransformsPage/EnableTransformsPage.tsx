import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Button,
  Card,
  Center,
  Group,
  Icon,
  type IconName,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
export const EnableTransformsPage = () => {
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <PageContainer>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
        }
      />
      <Center>
        <Card withBorder p="3rem" w="40rem">
          <Stack gap="md" align="start">
            <Title order={2}>{t`Customize and clean up your data`}</Title>
            <Text lh="1.25rem">{t`Transforms let you create new tables within your connected databases, helping you make nicer and more self-explanatory datasets for your end users to look at and explore.`}</Text>
            {isAdmin && (
              <>
                <Text
                  fw="bold"
                  lh="1.25rem"
                >{t`Because transforms require write access to your database, make sure you know what you’re doing and that you understand the risks.`}</Text>
                <Button variant="primary">{t`Enable transforms`}</Button>
              </>
            )}
          </Stack>
          <SimpleGrid cols={2} mt="3rem" spacing="sm">
            <SimpleCard
              icon="sql"
              title={t`Custom tables`}
              description={t`Create the tables your end users need with SQL queries`}
            />
            <SimpleCard
              icon="clock"
              title={t`Smart scheduling`}
              description={t`Tell your transformd when to run by assigning tags`}
            />
            <SimpleCard
              icon="eye"
              title={t`Observability`}
              description={t`See which transforms ran, and when`}
            />
            <SimpleCard
              icon="lock"
              title={t`Permissioned`}
              description={t`Only Admins can create and run transforms`}
            />
          </SimpleGrid>
        </Card>
      </Center>
    </PageContainer>
  );
};

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
