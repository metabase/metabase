import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { CreateDashboardModal } from "metabase/common/CreateDashboard/CreateDashboardModal";
import { AddDataModal } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal";
import { PLUGIN_TENANTS } from "metabase/plugins";

import { useCompletedSetupGuideSteps, useGetSetupGuideSteps } from "../hooks";
import type {
  SetupGuideModalToTrigger,
  SetupGuideStepId,
} from "../types/setup-guide";

import { SetupGuideXrayPickerModal } from "./SetupGuideXrayPickerModal";
import {
  type StepperCardClickAction,
  type StepperStep,
  StepperWithCards,
} from "./StepperWithCards/StepperWithCards";

export const SetupGuide = () => {
  const embeddingSteps = useGetSetupGuideSteps();
  const { data: completedSteps } = useCompletedSetupGuideSteps();

  const [openedModal, setOpenedModal] =
    useState<SetupGuideModalToTrigger | null>(null);

  const closeModal = () => setOpenedModal(null);

  const lockedSteps: Partial<Record<SetupGuideStepId, boolean>> = useMemo(
    () => ({
      "embed-production": !completedSteps?.["sso-configured"],
    }),
    [completedSteps],
  );

  const stepperSteps: StepperStep[] = useMemo(() => {
    const getAlert = (stepId: string) => {
      if (stepId === "create-test-embed") {
        const areSimpleStepsCompleted =
          completedSteps["add-data"] &&
          completedSteps["create-dashboard"] &&
          completedSteps["create-test-embed"];

        if (areSimpleStepsCompleted) {
          return {
            type: "success" as const,
            message: t`If all you want is a simple embedded dashboard, you're done! \n If you have a more sophisticated setup in mind, with many users and tenants, then keep going.`,
          };
        }

        return {
          type: "info" as const,
          message: t`If all you want is a simple embedded dashboard, the steps above are all you need! \n If you have a more sophisticated setup in mind, with many users and tenants, then keep going.`,
        };
      }
    };

    return embeddingSteps.map((step) => ({
      id: step.id,
      title: step.title,
      alert: getAlert(step.id),
      cards: step.actions.map((action) => {
        const stepId = action.stepId ?? step.id;

        const clickAction: StepperCardClickAction | undefined = match(action)
          .with({ to: P.string }, ({ to }) => ({ type: "link" as const, to }))
          .with({ onClick: P.nonNullable }, ({ onClick }) => ({
            type: "click" as const,
            onClick,
          }))
          .with({ docsPath: P.string }, ({ docsPath, anchor }) => ({
            type: "docs" as const,
            docsPath,
            anchor,
            utm: { utm_campaign: "embedding_hub", utm_content: stepId },
          }))
          .with({ modal: P.nonNullable }, ({ modal }) => ({
            type: "click" as const,
            onClick: () => setOpenedModal(modal),
          }))
          .otherwise(() => undefined);

        return {
          id: `${stepId}-${action.title}`,
          title: action.title,
          description: action.description,
          optional: action.optional,

          // TODO: add completion checks for the 'create models' step
          done: completedSteps?.[stepId] ?? false,
          locked: lockedSteps?.[stepId] ?? false,

          clickAction,
        };
      }),
    }));
  }, [embeddingSteps, completedSteps, lockedSteps]);

  return (
    <>
      <StepperWithCards steps={stepperSteps} />
      <AddDataModal
        opened={openedModal?.type === "add-data"}
        onClose={closeModal}
        initialTab={
          openedModal?.type === "add-data" ? openedModal?.initialTab : undefined
        }
        fromEmbeddingSetupGuide
      />
      <CreateDashboardModal
        opened={openedModal?.type === "new-dashboard"}
        onClose={closeModal}
      />
      <SetupGuideXrayPickerModal
        opened={openedModal?.type === "xray-dashboard"}
        onClose={closeModal}
      />
      {openedModal?.type === "user-strategy" && (
        <PLUGIN_TENANTS.EditUserStrategyModal onClose={closeModal} />
      )}
    </>
  );
};
