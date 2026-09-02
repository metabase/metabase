import { useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { OnboardingStepper } from "metabase/embedding/setup-guide/components/OnboardingStepper";
import type { OnboardingStepperHandle } from "metabase/embedding/setup-guide/components/OnboardingStepper/types";
import { Group, Icon, Stack, Text, Title } from "metabase/ui";

import { useGetSetupGuideChecklistQuery } from "../../api/setup-guide";

import { AddEndpointStep } from "./AddEndpointStep";
import { SetupJwtStep } from "./SetupJwtStep";
import S from "./SetupSsoPage.module.css";
import { TestJwtStep } from "./TestJwtStep";

export const SetupSsoPage = () => {
  const stepperRef = useRef<OnboardingStepperHandle>(null);

  const { data: checklistResponse } = useGetSetupGuideChecklistQuery();
  const checklist = checklistResponse?.checklist;

  // Prefer in-session success state; fall back to backend detection on reload.
  const [isJwtConfigured, setIsJwtConfigured] = useState(false);

  // UI-only confirmation state for step 2
  const [isAddEndpointConfirmed, setIsAddEndpointConfirmed] = useState(false);

  const handleAddEndpointDone = () => {
    setIsAddEndpointConfirmed(true);
    stepperRef.current?.goToNextStep();
  };

  const completedSteps = useMemo(() => {
    const isSsoAuthManualTested =
      checklist?.["sso-auth-manual-tested"] ?? false;
    const isJwtSetupDone =
      isJwtConfigured || (checklist?.["sso-configured"] ?? false);

    return {
      "setup-jwt": isJwtSetupDone,
      "add-endpoint": isAddEndpointConfirmed || isSsoAuthManualTested,
      "test-jwt": isSsoAuthManualTested,
    };
  }, [checklist, isAddEndpointConfirmed, isJwtConfigured]);

  const lockedSteps = useMemo(() => {
    return {
      "add-endpoint": !completedSteps["setup-jwt"],
      "test-jwt": !completedSteps["setup-jwt"],
    };
  }, [completedSteps]);

  return (
    <Stack mx="auto" gap="sm" maw={680}>
      <Link to=".." className={S.backLink}>
        <Group gap="xxs">
          <Icon name="chevronleft" size={12} />
          <Text size="sm" c="text-secondary">{t`Back to the setup guide`}</Text>
        </Group>
      </Link>

      <Title order={1} c="text-primary" mb="xxl">
        {t`Configure SSO`}
      </Title>

      <OnboardingStepper
        ref={stepperRef}
        completedSteps={completedSteps}
        lockedSteps={lockedSteps}
      >
        <OnboardingStepper.Step
          stepId="setup-jwt"
          title={t`Set up JWT authentication`}
        >
          <SetupJwtStep
            onSuccess={() => {
              setIsJwtConfigured(true);
              stepperRef.current?.goToNextStep();
            }}
          />
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
