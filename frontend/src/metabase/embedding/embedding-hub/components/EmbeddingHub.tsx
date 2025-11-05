import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";

import { CreateDashboardModal } from "metabase/dashboard/containers/CreateDashboardModal";
import { AddDataModal } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal";

import {
  useCompletedEmbeddingHubSteps,
  useGetEmbeddingHubSteps,
} from "../hooks";
import type {
  EmbeddingHubModalToTrigger,
  EmbeddingHubStepId,
} from "../types/embedding-checklist";

import { EmbeddingHubXrayPickerModal } from "./EmbeddingHubXrayPickerModal";
import {
  type StepperCardClickAction,
  type StepperStep,
  StepperWithCards,
} from "./StepperWithCards/StepperWithCards";

export const EmbeddingHub = () => {
  const embeddingSteps = useGetEmbeddingHubSteps();
  const { data: completedSteps } = useCompletedEmbeddingHubSteps();

  const [openedModal, setOpenedModal] =
    useState<EmbeddingHubModalToTrigger | null>(null);

  const closeModal = () => setOpenedModal(null);

  const lockedSteps: Partial<Record<EmbeddingHubStepId, boolean>> = useMemo(
    () => ({
      "embed-production": !completedSteps?.["secure-embeds"],
    }),
    [completedSteps],
  );

  const stepperSteps: StepperStep[] = useMemo(() => {
    return embeddingSteps.map((step) => ({
      id: step.id,
      title: step.title,
      cards: step.actions.map((action) => {
        const stepId = action.stepId ?? step.id;

        const clickAction: StepperCardClickAction | undefined = match(action)
          .with({ to: P.string }, ({ to }) => ({ type: "link" as const, to }))
          .with({ onClick: P.nonNullable }, ({ onClick }) => ({
            type: "click" as const,
            onClick,
          }))
          .with({ docsPath: P.string }, ({ docsPath }) => ({
            type: "docs" as const,
            docsPath,
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
      />
      <CreateDashboardModal
        opened={openedModal?.type === "new-dashboard"}
        onClose={closeModal}
      />
      <EmbeddingHubXrayPickerModal
        opened={openedModal?.type === "xray-dashboard"}
        onClose={closeModal}
      />
    </>
  );
};
