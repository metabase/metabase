import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DashboardSharingEmbeddingModal } from "metabase/dashboard/components/DashboardSharingEmbeddingModal";
import { QuestionEmbedWidget } from "metabase/embedding/components/QuestionEmbedWidget";
import { useGetCurrentResource } from "metabase/embedding/embedding-iframe-sdk-setup/hooks";
import { useOpenEmbedJsWizard } from "metabase/embedding/hooks/use-open-embed-js-wizard";
import type { LegacyStaticEmbeddingModalProps } from "metabase/plugins";
import type { Card, Dashboard } from "metabase-types/api";

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
        // Unjustified type cast. FIXME
        card={resource as Card}
        onBack={handleBack}
        onClose={onClose}
      />
    );
  }

  if (experience === "dashboard") {
    return (
      <DashboardSharingEmbeddingModal
        // Unjustified type cast. FIXME
        dashboard={resource as Dashboard}
        onBack={handleBack}
        onClose={onClose}
        isOpen
      />
    );
  }

  return null;
};
