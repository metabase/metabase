import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

<<<<<<< HEAD
=======
import {
  RelatedSettingsSection,
  getEmbeddingRelatedSettingItems,
} from "metabase/admin/components/RelatedSettingsSection";
import MetabotLogo from "metabase/common/components/MetabotLogo";
>>>>>>> 229a09bd6d4 (fix related card sizing)
import { CreateDashboardModal } from "metabase/dashboard/containers/CreateDashboardModal";
import { AddDataModal } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal";
import { Stack, Text, Title } from "metabase/ui";

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

          clickAction,
        };
      }),
    }));
  }, [embeddingSteps, completedSteps]);

  return (
    <Stack mx="auto" py="xl" gap="xl" maw={800}>
      <Stack gap="xs" ml="3rem">
        <Title
          order={1}
          c="var(--mb-color-text-primary)"
        >{t`Embedding setup guide`}</Title>

<<<<<<< HEAD
        <Text c="var(--mb-color-text-secondary)">{t`Follow the guide to get started with Embedded Analytics JS`}</Text>
=======
          <Text fw="bold" size="lg" c="var(--mb-color-text-dark)">{t`Get started
         with Embedded Analytics JS and SDK for React`}</Text>
        </Group>
        <StepperWithCards steps={stepperSteps} />
        <Stack gap="md">
          <Text size="lg" fw="bold" lh="xs">
            {t`Related settings`}
          </Text>

          <RelatedSettingsSection items={getEmbeddingRelatedSettingItems()} />
        </Stack>
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
>>>>>>> 229a09bd6d4 (fix related card sizing)
      </Stack>
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
    </Stack>
  );
};
