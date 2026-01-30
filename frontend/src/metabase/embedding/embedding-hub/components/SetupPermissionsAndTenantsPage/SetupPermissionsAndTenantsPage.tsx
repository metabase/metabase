/* eslint-disable metabase/no-literal-metabase-strings -- This string only shows for admins */

import { useMemo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useGetEmbeddingHubChecklistQuery } from "metabase/api/embedding-hub";
import { OnboardingStepper } from "metabase/common/components/OnboardingStepper";
import { Button, Group, Icon, Stack, Text, Title } from "metabase/ui";

import S from "./SetupPermissionsAndTenantsPage.module.css";

const SETUP_GUIDE_PATH = "/admin/embedding/setup-guide";

export const SetupPermissionsAndTenantsPage = () => {
  const { data: checklist } = useGetEmbeddingHubChecklistQuery();
  const [isDataSegregationSelected, _setIsDataSegregationSelected] =
    useState(false);

  const completedSteps = useMemo(() => {
    const isDataSegregationComplete =
      isDataSegregationSelected ||
      checklist?.["setup-data-segregation-strategy"];

    return {
      "enable-tenants": checklist?.["enable-tenants"] ?? false,
      "data-segregation": isDataSegregationComplete ?? false,
      "select-data": isDataSegregationComplete ?? false,
      "create-tenants": checklist?.["create-tenants"] ?? false,
      summary: false,
    };
  }, [checklist, isDataSegregationSelected]);

  return (
    <Stack mx="auto" gap="sm" maw={800}>
      <Link to={SETUP_GUIDE_PATH} className={S.backLink}>
        <Group gap="xs">
          <Icon name="chevronleft" size={12} />
          <Text size="sm" c="text-secondary">{t`Back to the setup guide`}</Text>
        </Group>
      </Link>

      <Title order={1} c="text-primary" mb="xl">
        {t`Configure data permissions and enable tenants`}
      </Title>

      <OnboardingStepper completedSteps={completedSteps} lockedSteps={{}}>
        <OnboardingStepper.Step
          stepId="enable-tenants"
          title={t`Enable multi-tenant user strategy`}
        >
          <Stack gap="lg">
            <img
              src="app/assets/img/embedding-onboarding/multi-tenant-user-strategy.svg"
              alt=""
              className={S.illustration}
            />

            <Text size="md" c="text-primary" lh="lg">
              {t`A tenant is a set of attributes assigned to a user to isolate them from other tenants. For example, in a SaaS app with embedded Metabase dashboards, you can assign each customer to a tenant.`}
            </Text>

            <Text size="md" c="text-primary" lh="lg">
              {t`The main benefit of tenants is that you can reuse the same dashboards and permissions across all tenants, instead of recreating them for each customer, while ensuring each tenant only sees its own data. A shared collection will be created to hold dashboards and charts that are shared between all tenants.`}
            </Text>

            <Group justify="flex-end">
              <Button variant="filled">
                {t`Enable tenants and create shared collection`}
              </Button>
            </Group>
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
