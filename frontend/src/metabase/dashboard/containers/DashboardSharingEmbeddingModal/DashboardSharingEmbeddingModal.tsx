import { useMemo } from "react";

import {
  useCreateDashboardPublicLinkMutation,
  useDeleteDashboardPublicLinkMutation,
  useUpdateDashboardEmbeddingParamsMutation,
  useUpdateDashboardEnableEmbeddingMutation,
} from "metabase/api";
import { getDashcards, getParameters } from "metabase/dashboard/selectors";
import { findDashCardForInlineParameter } from "metabase/dashboard/utils";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getParameterUrlSlug } from "metabase/parameters/utils/parameter-context";
import {
  EmbedModal,
  EmbedModalContent,
} from "metabase/public/components/EmbedModal";
import type { Dashboard } from "metabase-types/api";

export type DashboardSharingEmbeddingModalProps = {
  className?: string;
  dashboard: Dashboard;
  isOpen: boolean;
  onClose: () => void;
};

export const DashboardSharingEmbeddingModal = ({
  className,
  dashboard,
  isOpen,
  onClose,
}: DashboardSharingEmbeddingModalProps) => {
  const parameters = useSelector(getParameters);
  const dashcards = useSelector(getDashcards);

  // Generate scoped parameters for embedding to handle parameters with the same name
  // but different scopes (dashboard-level vs dashcard-level)
  const resourceParameters = useMemo(() => {
    const dashcardList = Object.values(dashcards);

    return parameters.map((parameter) => {
      const dashcard = findDashCardForInlineParameter(
        parameter.id,
        dashcardList,
      );
      const scopedSlug = getParameterUrlSlug(parameter, dashcard);

      return {
        id: parameter.id,
        name: parameter.name,
        slug: scopedSlug, // Use scoped slug instead of basic slug
        type: parameter.type,
        required: parameter.required,
        default: parameter.default,
      };
    });
  }, [parameters, dashcards]);

  const [createPublicDashboardLink] = useCreateDashboardPublicLinkMutation();
  const [deletePublicDashboardLink] = useDeleteDashboardPublicLinkMutation();
  const [updateDashboardEmbeddingParams] =
    useUpdateDashboardEmbeddingParamsMutation();
  const [updateDashboardEnableEmbedding] =
    useUpdateDashboardEnableEmbeddingMutation();

  const getPublicUrl = (publicUuid: string) => Urls.publicDashboard(publicUuid);

  return (
    <EmbedModal isOpen={isOpen} onClose={onClose}>
      {({ embedType, goToNextStep }) => (
        <EmbedModalContent
          embedType={embedType}
          goToNextStep={goToNextStep}
          className={className}
          resource={dashboard}
          resourceParameters={resourceParameters}
          resourceType="dashboard"
          onCreatePublicLink={() =>
            createPublicDashboardLink({ id: dashboard.id })
          }
          onDeletePublicLink={() =>
            deletePublicDashboardLink({ id: dashboard.id })
          }
          onUpdateEnableEmbedding={(enable_embedding) =>
            updateDashboardEnableEmbedding({
              id: dashboard.id,
              enable_embedding,
            })
          }
          onUpdateEmbeddingParams={(embedding_params) =>
            updateDashboardEmbeddingParams({
              id: dashboard.id,
              embedding_params,
            })
          }
          getPublicUrl={getPublicUrl}
        />
      )}
    </EmbedModal>
  );
};
