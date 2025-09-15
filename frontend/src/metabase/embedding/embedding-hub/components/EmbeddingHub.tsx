import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import {
  RelatedSettingsSection,
  getModularEmbeddingRelatedSettingItems,
} from "metabase/admin/components/RelatedSettingsSection";
import { CreateDashboardModal } from "metabase/dashboard/containers/CreateDashboardModal";
import { AddDataModal } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal";
import { Stack, Text, Title } from "metabase/ui";

import { useCompletedEmbeddingHubSteps } from "../hooks";
import type {
  EmbeddingHubModalToTrigger,
  EmbeddingHubStepId,
} from "../types/embedding-checklist";
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
    <Stack mx="auto" py="xl" gap="xl" maw={800}>
      <Stack gap="xs" ml="3rem">
        <Title
          order={1}
          c="var(--mb-color-text-primary)"
        >{t`Embedding setup guide`}</Title>

        <Text c="var(--mb-color-text-secondary)">{t`Follow the guide to get started with Embedded Analytics JS`}</Text>
      </Stack>
      <StepperWithCards steps={stepperSteps} />
      <RelatedSettingsSection
        items={getModularEmbeddingRelatedSettingItems()}
      />
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
    </Stack>
  );
};
