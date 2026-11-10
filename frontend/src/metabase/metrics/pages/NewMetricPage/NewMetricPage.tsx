import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetDefaultCollectionId } from "metabase/common/collections/hooks";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { PillTabNavigation } from "metabase/common/components/PillTabNavigation";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "metabase/common/data-studio/components/PaneHeader";
import { getResultMetadata } from "metabase/common/data-studio/utils/get-result-metadata";
import { useMetadataToasts } from "metabase/common/hooks";
import type { MetricUrls } from "metabase/common/metrics/types";
import {
  type DimensionsDraft,
  DraftMetricDimensions,
  applyDimensionsDraft,
  getDimensionCandidates,
  getSeededDraft,
} from "metabase/metrics/components/MetricDimensions";
import { MetricQueryEditor } from "metabase/metrics/components/MetricQueryEditor";
import { NAME_MAX_LENGTH } from "metabase/metrics/constants";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { useDispatch, useSelector } from "metabase/redux";
import { useLocation, useNavigate } from "metabase/router";
import { Box, Breadcrumbs, Card, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type { Card as CardApiType } from "metabase-types/api";

import { metricUrls as defaultUrls } from "../../urls";
import { getValidationResult } from "../../utils/validation";

import { CreateMetricModal } from "./CreateMetricModal";
import { getInitialQuery, getQuery } from "./utils";

interface NewMetricPageProps {
  urls?: MetricUrls;
  renderBreadcrumbs?: () => ReactNode;
  showAppSwitcher?: boolean;
  triggeredFrom?: "data_studio" | "main_app";
}

export function NewMetricPage({
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher = false,
  triggeredFrom = "main_app",
}: NewMetricPageProps) {
  const location = useLocation();
  const initialQuery = useSelector(getInitialQuery);
  const [name, setName] = useState("");
  const [datasetQuery, setDatasetQuery] = useState(() =>
    Lib.toJsQuery(initialQuery),
  );
  const [uiState, setUiState] = useState(getInitialUiState);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const initialCollectionId = Urls.extractCollectionId(
    new URLSearchParams(location.search).get("collectionId") ?? undefined,
  );
  const defaultCollectionId = useGetDefaultCollectionId();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { sendErrorToast } = useMetadataToasts();
  const [tab, setTab] = useState<"definition" | "dimensions">("definition");
  // `null` until the dimensions are edited; saving then leaves them as seeded
  const [dimensionsDraft, setDimensionsDraft] =
    useState<DimensionsDraft | null>(null);

  const query = useSelector((state) => getQuery(state, datasetQuery));

  const resultMetadata = useMemo(() => {
    return getResultMetadata(
      datasetQuery,
      uiState.lastRunQuery,
      uiState.lastRunResult,
    );
  }, [datasetQuery, uiState.lastRunResult, uiState.lastRunQuery]);

  const validationResult = useMemo(() => getValidationResult(query), [query]);
  const dimensionCandidates = useMemo(
    () => getDimensionCandidates(query),
    [query],
  );

  const defaultValues = useMemo(
    () => ({
      name: name === "" ? Lib.suggestedName(query) : name,
      result_metadata: resultMetadata,
      collection_id: initialCollectionId ?? defaultCollectionId,
    }),
    [name, query, resultMetadata, initialCollectionId, defaultCollectionId],
  );

  const handleCreate = async (card: CardApiType) => {
    // PROTOTYPE: dimensions edited before saving are applied to the new metric
    if (dimensionsDraft != null) {
      try {
        await applyDimensionsDraft(
          dispatch,
          card.id,
          dimensionCandidates,
          dimensionsDraft,
        );
      } catch {
        sendErrorToast(
          t`Metric saved, but some dimension changes didn't apply`,
        );
      }
    }
    navigate(urls.about(card.id));
  };

  const handleChangeQuery = (query: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(query));
  };

  const handleCancel = () => {
    navigate(-1);
  };

  return (
    <>
      <PageContainer pos="relative" gap="lg" data-testid="metric-query-editor">
        <PaneHeader
          showAppSwitcher={showAppSwitcher}
          title={
            <PaneHeaderInput
              initialValue={name}
              placeholder={t`New metric`}
              maxLength={NAME_MAX_LENGTH}
              isOptional
              onChange={setName}
            />
          }
          icon="metric"
          tabs={
            <Box mt="md">
              <PillTabNavigation
                tabs={[
                  {
                    label: t`Definition`,
                    isSelected: tab === "definition",
                    onClick: () => setTab("definition"),
                  },
                  {
                    label: t`Dimensions`,
                    isSelected: tab === "dimensions",
                    onClick: () => setTab("dimensions"),
                  },
                ]}
              />
            </Box>
          }
          actions={
            <PaneHeaderActions
              errorMessage={validationResult.errorMessage}
              isValid={validationResult.isValid}
              isDirty
              onSave={openModal}
              onCancel={handleCancel}
            />
          }
          breadcrumbs={
            renderBreadcrumbs ? (
              renderBreadcrumbs()
            ) : (
              <Breadcrumbs
                separator={<Icon size={12} name="chevronright" />}
                fz="sm"
                c="text-secondary"
              >
                <span>{t`New Metric`}</span>
              </Breadcrumbs>
            )
          }
        />
        {tab === "definition" ? (
          <Card withBorder shadow="none" p={0} flex={1}>
            <MetricQueryEditor
              query={query}
              uiState={uiState}
              onChangeQuery={handleChangeQuery}
              onChangeUiState={setUiState}
            />
          </Card>
        ) : (
          <DraftMetricDimensions
            candidates={dimensionCandidates}
            draft={dimensionsDraft ?? getSeededDraft(dimensionCandidates)}
            onChange={setDimensionsDraft}
          />
        )}
      </PageContainer>
      {isModalOpened && (
        <CreateMetricModal
          query={query}
          defaultValues={defaultValues}
          triggeredFrom={triggeredFrom}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
      <LeaveRouteConfirmModal isEnabled={!isModalOpened} />
    </>
  );
}
