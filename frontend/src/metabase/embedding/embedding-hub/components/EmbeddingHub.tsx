import cx from "classnames";
import { useMemo, useState } from "react";
import { c, t } from "ttag";

import CS from "metabase/css/core/index.css";
import { CreateDashboardModal } from "metabase/dashboard/containers/CreateDashboardModal";
import { AddDataModal } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal";
import { Box, Icon, Menu, Text, Title } from "metabase/ui";

import { useCompletedEmbeddingHubSteps } from "../hooks";
import type { EmbeddingHubStepId } from "../types";
import type { EmbeddingHubModalToTrigger } from "../types/embedding-checklist";
import { getEmbeddingHubSteps } from "../utils";

import { EmbeddingHubChecklist } from "./EmbeddingHubChecklist";
import { EmbeddingHubXrayPickerModal } from "./EmbeddingHubXrayPickerModal";

export const EmbeddingHub = () => {
  const embeddingSteps = useMemo(() => getEmbeddingHubSteps(), []);
  const { data: completedSteps } = useCompletedEmbeddingHubSteps();

  const [openedModal, setOpenedModal] =
    useState<EmbeddingHubModalToTrigger | null>(null);

  // Find the first unchecked step to open by default.
  // This is undefined when every step has been completed.
  const firstUncompletedStep = embeddingSteps.find(
    (step) => !completedSteps[step.id],
  );

  const closeModal = () => setOpenedModal(null);

  const lockedSteps: Partial<Record<EmbeddingHubStepId, boolean>> = {
    // Production embeds requires JWT to be configured.
    "embed-production": !completedSteps["secure-embeds"],
  };

  return (
    <Box mih="100%" px="lg" py="xl" bg="bg-white">
      <Box maw={600} mx="auto">
        <Title order={1} mb="sm" c="text-dark">{t`Embedding hub`}</Title>

        <Text mb="xl" c="text-medium">
          {c("{0} is the link to the selected embedding type.")
            .jt`Get started with ${(<EmbeddingTypeDropdown />)}`}
        </Text>

        <EmbeddingHubChecklist
          steps={embeddingSteps}
          completedSteps={completedSteps}
          lockedSteps={lockedSteps}
          defaultOpenStep={firstUncompletedStep?.id}
          onModalAction={setOpenedModal}
        />

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

/**
 * TODO: made the other embedding types functional.
 *
 * This is just to illustrate that we will be able to pick other
 * embedding types soon.
 */
const EmbeddingTypeDropdown = () => (
  <Menu key="embedded-analytics-js-menu" position="bottom-start">
    <Menu.Target>
      <span className={cx(CS.textBold, CS.link, CS.cursorPointer)}>
        <span>{t`Embedded Analytics JS`}</span>

        <Icon name="chevrondown" size={12} ml={4} />
      </span>
    </Menu.Target>

    <Menu.Dropdown>
      <Menu.Item>{t`Embedded Analytics JS`}</Menu.Item>
      <Menu.Item disabled>{t`Embedded Analytics SDK for React`}</Menu.Item>
      <Menu.Item disabled>{t`Static embedding`}</Menu.Item>
      <Menu.Item disabled>{t`Help me choose`}</Menu.Item>
    </Menu.Dropdown>
  </Menu>
);
