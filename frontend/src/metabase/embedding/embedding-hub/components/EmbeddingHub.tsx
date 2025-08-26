import cx from "classnames";
import { useMemo, useState } from "react";
import { c, t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { CreateDashboardModal } from "metabase/dashboard/containers/CreateDashboardModal";
import { AddDataModal } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal";
import { Box, Text, Title } from "metabase/ui";

import { useCompletedEmbeddingHubSteps } from "../hooks";
import type { EmbeddingHubModalToTrigger } from "../types/embedding-checklist";
import { getEmbeddingHubSteps } from "../utils";

import { EmbeddingHubChecklist } from "./EmbeddingHubChecklist";
import { EmbeddingHubXrayPickerModal } from "./EmbeddingHubXrayPickerModal";

export const EmbeddingHub = () => {
  const embeddingSteps = useMemo(() => getEmbeddingHubSteps(), []);
  const completedSteps = useCompletedEmbeddingHubSteps();

  const [openedModal, setOpenedModal] =
    useState<EmbeddingHubModalToTrigger | null>(null);

  // Find the first unchecked step to open by default.
  // This is undefined when every step has been completed.
  const firstUncompletedStep = embeddingSteps.find(
    (step) => !completedSteps[step.id],
  );

  const closeModal = () => setOpenedModal(null);

  // eslint-disable-next-line no-unconditional-metabase-links-render -- This links only shows for admins.
  const embedJsDocsUrl = useDocsUrl("embedding/embedded-analytics-js");

  return (
    <Box mih="100%" px="lg" py="xl" bg="bg-white">
      <Box maw={600} mx="auto">
        <Title order={1} mb="sm" c="text-dark">{t`Embedding hub`}</Title>

        <Text mb="xl" c="text-medium">
          {c("{0} is the link to the selected embedding type.")
            .jt`Get started with ${(<ExternalLink href={embedJsDocsUrl?.url} className={cx(CS.textBold, CS.link)} key="embedded-analytics-js-link">{t`Embedded Analytics JS`}</ExternalLink>)}.`}
        </Text>

        <EmbeddingHubChecklist
          steps={embeddingSteps}
          completedSteps={completedSteps}
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
          opened={openModal?.type === "xray-dashboard"}
          onClose={closeModal}
        />
      </Box>
    </Box>
  );
};
