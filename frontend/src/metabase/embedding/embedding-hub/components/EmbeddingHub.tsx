import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { CreateDashboardModal } from "metabase/dashboard/containers/CreateDashboardModal";
import { AddDataModal } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal";
import { Box, Group, Title } from "metabase/ui";

import { useCompletedEmbeddingHubSteps } from "../hooks";
import type { EmbeddingHubModalToTrigger } from "../types/embedding-checklist";
import { getEmbeddingHubSteps } from "../utils";

import { EmbeddingHubXrayPickerModal } from "./EmbeddingHubXrayPickerModal";
import {
  type StepperCardClickAction,
  type StepperStep,
  StepperWithCards,
} from "./StepperWithCards/StepperWithCards";

export const EmbeddingHub = () => {
  const embeddingSteps = useMemo(() => getEmbeddingHubSteps(), []);
  const { data: completedSteps } = useCompletedEmbeddingHubSteps();

  const [openedModal, setOpenedModal] =
    useState<EmbeddingHubModalToTrigger | null>(null);

  const closeModal = () => setOpenedModal(null);

  const stepperSteps: StepperStep[] = useMemo(() => {
    return embeddingSteps.map((step) => ({
      title: step.title,
      cards: step.actions.map((action) => {
        const stepId = action.stepId ?? step.id;

        const clickAction: StepperCardClickAction | undefined = match(action)
          .with({ to: P.string }, ({ to }) => ({ type: "link" as const, to }))
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
          title: action.title,
          description: action.description,
          optional: action.optional,

          // TODO: add completion check for optional steps
          done: !action.optional && (completedSteps?.[stepId] ?? false),

          clickAction,
        };
      }),
    }));
  }, [embeddingSteps, completedSteps]);

  return (
    <Box mih="100%" px="xl" py="xl" bg="bg-white">
      <Box maw={800} mx="auto">
        <Group>
          <Title mb="sm" size="lg" c="var(--mb-color-text-dark)">{t`Get started
         with Embedded Analytics JS and SDK for React`}</Title>
        </Group>
        <StepperWithCards steps={stepperSteps} />;
        <AddDataModal
          opened={openedModal?.type === "add-data"}
          onClose={closeModal}
          initialTab={
            openedModal?.type === "add-data"
              ? openedModal?.initialTab
              : undefined
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
      </Box>
    </Box>
  );
};
