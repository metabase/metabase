import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useGetEmbeddingHubChecklistQuery } from "metabase/api/embedding-hub";
import { OnboardingStepper } from "metabase/common/components/OnboardingStepper";
import type { OnboardingStepperHandle } from "metabase/common/components/OnboardingStepper/types";
import { Group, Icon, Stack, Text, Title } from "metabase/ui";

import { AddEndpointStep } from "./AddEndpointStep";
import { SetupJwtStep } from "./SetupJwtStep";
import S from "./SetupSsoPage.module.css";
import { TestJwtStep } from "./TestJwtStep";

const SETUP_GUIDE_PATH = "/admin/embedding/setup-guide";

export const SetupSsoPage = () => {
  const stepperRef = useRef<OnboardingStepperHandle>(null);

  const { data: checklist } = useGetEmbeddingHubChecklistQuery();

  // UI-only confirmation state for step 2
  const [isAddEndpointConfirmed, setIsAddEndpointConfirmed] = useState(false);

  const handleAddEndpointDone = () => {
    setIsAddEndpointConfirmed(true);
    stepperRef.current?.goToNextStep();
  };

  const completedSteps = useMemo(() => {
    const isSsoAuthManualTested =
      checklist?.["sso-auth-manual-tested"] ?? false;

    return {
      "setup-jwt": checklist?.["sso-configured"] ?? false,
      "add-endpoint": isAddEndpointConfirmed || isSsoAuthManualTested,
      "test-jwt": isSsoAuthManualTested,
    };
  }, [checklist, isAddEndpointConfirmed]);

  return (
    <Stack mx="auto" gap="sm" maw={680}>
      <Link to={SETUP_GUIDE_PATH} className={S.backLink}>
        <Group gap="xs">
          <Icon name="chevronleft" size={12} />
          <Text size="sm" c="text-secondary">{t`Back to the setup guide`}</Text>
        </Group>
      </Link>

      <Title order={1} c="text-primary" mb="xl">
        {t`Configure SSO`}
      </Title>

      <OnboardingStepper
        ref={stepperRef}
        completedSteps={completedSteps}
        lockedSteps={{}}
      >
        <OnboardingStepper.Step
          stepId="setup-jwt"
          title={t`Set up JWT authentication`}
        >
          <SetupJwtStep onSuccess={() => stepperRef.current?.goToNextStep()} />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="add-endpoint"
          title={t`Add a new endpoint to your app`}
        >
          <AddEndpointStep onDone={handleAddEndpointDone} />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="test-jwt"
          title={t`Test that JWT authentication is working correctly`}
          hideTitleOnActive
        >
          <TestJwtStep />
        </OnboardingStepper.Step>
      </OnboardingStepper>
    </Stack>
  );
};
