import { t } from "ttag";

import { DashboardSharingEmbeddingModal } from "metabase/dashboard/containers/DashboardSharingEmbeddingModal";
import { useGetCurrentResource } from "metabase/embedding/embedding-iframe-sdk-setup/hooks";
import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import { useOpenEmbedJsWizard } from "metabase/embedding/hooks/use-open-embed-js-wizard";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";
import { LoadingAndErrorWrapper } from "metabase/public/containers/PublicAction/PublicAction.styled";
import { QuestionEmbedWidget } from "metabase/query_builder/components/QuestionEmbedWidget";
import type { Card, Dashboard, DashboardId } from "metabase-types/api";

export type LegacyStaticEmbeddingModalProps = {
  experience: SdkIframeEmbedSetupExperience;
  dashboardId?: DashboardId | null;
  questionId?: string | number | null;
  parentInitialState: SdkIframeEmbedSetupModalInitialState | undefined;
};

export type InternalProps = LegacyStaticEmbeddingModalProps & {
  onClose: () => void;
};

export const LegacyStaticEmbeddingModal = ({
  experience,
  dashboardId,
  questionId,
  parentInitialState,
  onClose,
}: InternalProps) => {
  const { resource, isError, isLoading } = useGetCurrentResource({
    experience,
    dashboardId,
    questionId,
  });

  const openEmbedJsWizard = useOpenEmbedJsWizard({
    initialState: parentInitialState,
  });

  if (isLoading || isError) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={isError ? t`Something’s gone wrong` : undefined}
      />
    );
  }

  const handleBack = () => {
    openEmbedJsWizard({ onBeforeOpen: () => onClose() });
  };

  if (experience === "chart") {
    return (
      <QuestionEmbedWidget
        card={resource as Card}
        onBack={handleBack}
        onClose={onClose}
      />
    );
  }

  if (experience === "dashboard") {
    return (
      <DashboardSharingEmbeddingModal
        dashboard={resource as Dashboard}
        onBack={handleBack}
        onClose={onClose}
        isOpen
      />
    );
  }

  return null;
};
