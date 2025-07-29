import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { Flex, Text, Title } from "metabase/ui";

import { NewTransformMenu } from "../../components/NewTransformMenu";

export function NewTransformPage() {
  return (
    <Flex
      direction="column"
      justify="center"
      align="center"
      w="100%"
      h="100%"
      p="md"
    >
      <Flex direction="column" justify="center" align="center">
        <img
          src={EmptyDashboardBot}
          alt={t`Empty dashboard`}
          width={96}
          height={96}
        />
        <Title order={3} c="text-secondary" mt="md" ta="center">
          {t`Create custom views and tables with transforms`}
        </Title>
        <Text c="text-secondary" mt="sm" mb="xl" ta="center">
          {t`You can write SQL, use the query builder, or an existing query.`}
        </Text>
        <NewTransformMenu />
      </Flex>
    </Flex>
  );
}
