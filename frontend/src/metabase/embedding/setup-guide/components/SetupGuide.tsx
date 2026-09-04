import { useMemo } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { RETURN_TO_SETUP_GUIDE_PARAM } from "metabase/embedding/constants";

import {
  useCompletedSetupGuideSteps,
  useGetSetupGuideSteps,
  useSetupGuideModals,
} from "../hooks";
import type { SetupGuideStepId } from "../types/setup-guide";

import {
  type StepperCardClickAction,
  type StepperStep,
  StepperWithCards,
} from "./StepperWithCards/StepperWithCards";

export const SetupGuide = ({ returnTo }: { returnTo?: string } = {}) => {
  const embeddingSteps = useGetSetupGuideSteps();
  const { data: completedSteps } = useCompletedSetupGuideSteps();

  // Flows that leave the guide -- connecting a database, for one -- come back
  // here, and the guide has more than one host.
  const { setOpenedModal, modals } = useSetupGuideModals({ returnTo });

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
          .with({ to: P.string }, ({ to }) => ({
            type: "link" as const,
            to: returnTo
              ? `${to}?${RETURN_TO_SETUP_GUIDE_PARAM}=${encodeURIComponent(returnTo)}`
              : to,
          }))
          .with({ onClick: P.nonNullable }, ({ onClick }) => ({
            type: "click" as const,
            onClick,
          }))
          .with({ docsPath: P.string }, ({ docsPath, anchor }) => ({
            type: "docs" as const,
            docsPath,
            anchor,
            utm: { utm_campaign: "setup-guide", utm_content: stepId },
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
  }, [embeddingSteps, completedSteps, lockedSteps, setOpenedModal, returnTo]);

  return (
    <>
      <StepperWithCards steps={stepperSteps} />
      {modals}
    </>
  );
};
