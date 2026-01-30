import { Link } from "react-router";
import { t } from "ttag";

import { OnboardingStepper } from "metabase/common/components/OnboardingStepper";
import { Box, Button, Group, Icon, Stack, Text, Title } from "metabase/ui";

import S from "./SetupPermissionsAndTenantsPage.module.css";

const SETUP_GUIDE_PATH = "/admin/embedding/setup-guide";

export const SetupPermissionsAndTenantsPage = () => {
  return (
    <Stack mx="auto" py="xl" gap="xl" maw={800}>
      <Link to={SETUP_GUIDE_PATH} className={S.backLink}>
        <Group gap="xs">
          <Icon name="chevronleft" size={12} />
          <Text size="sm" c="text-secondary">{t`Back to the setup guide`}</Text>
        </Group>
      </Link>

      <Title order={1} c="text-primary">
        {t`Configure data permissions and enable tenants`}
      </Title>

      <OnboardingStepper>
        <OnboardingStepper.Step
          stepId="enable-tenants"
          title={t`Enable multi-tenant user strategy`}
        >
          <Stack gap="md">
            <img
              src="app/assets/img/embedding-onboarding/multi-tenant-user-strategy.svg"
              alt=""
              className={S.illustration}
            />

            <Text size="sm" c="text-secondary" lh="lg">
              {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins */}
              {t`A tenant is a set of attributes assigned to a user to isolate them from other tenants. For example, in a SaaS app with embedded Metabase dashboards, you can assign each customer to a tenant.`}
            </Text>

            <Text size="sm" c="text-secondary" lh="lg">
              {t`The main benefit of tenants is that you can reuse the same dashboards and permissions across all tenants, instead of recreating them for each customer, while ensuring each tenant only sees its own data. A shared collection will be created to hold dashboards and charts that are shared between all tenants.`}
            </Text>

            <Box>
              <Button variant="filled">
                {t`Enable tenants and create shared collection`}
              </Button>
            </Box>
          </Stack>
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="data-segregation"
          title={t`Which data segregation strategy does your database use?`}
        >
          <Text c="text-secondary" size="sm" lh="lg">
            {t`Configure how your data is separated between tenants.`}
          </Text>
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="select-data"
          title={t`Select data to make available`}
        >
          <Text c="text-secondary" size="sm" lh="lg">
            {t`Choose which tables and columns are available for embedding.`}
          </Text>
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="create-tenants"
          title={t`Create tenants`}
        >
          <Text c="text-secondary" size="sm" lh="lg">
            {t`Set up tenants to isolate data between different customers.`}
          </Text>
        </OnboardingStepper.Step>

        <OnboardingStepper.Step stepId="summary" title={t`Summary`}>
          <Text c="text-secondary" size="sm" lh="lg">
            {t`Review your configuration and complete the setup.`}
          </Text>
        </OnboardingStepper.Step>
      </OnboardingStepper>
    </Stack>
  );
};
