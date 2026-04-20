import { useDisclosure } from "@mantine/hooks";
import type { Location } from "history";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { goBack, push } from "react-router-redux";
import { t } from "ttag";

import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "metabase/data-studio/common/components/PaneHeader";
import { getResultMetadata } from "metabase/data-studio/common/utils";
import { MetricQueryEditor } from "metabase/metrics/components/MetricQueryEditor";
import { NAME_MAX_LENGTH } from "metabase/metrics/constants";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Breadcrumbs, Card, Icon } from "metabase/ui";
import { useDispatch, useSelector } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import * as Lib from "metabase-lib";
import type { Card as CardApiType } from "metabase-types/api";

import type { MetricUrls } from "../../types";
import { metricUrls as defaultUrls } from "../../urls";
import { getValidationResult } from "../../utils/validation";

import { CreateMetricModal } from "./CreateMetricModal";
import { getInitialQuery, getQuery } from "./utils";

interface NewMetricPageQuery {
  collectionId?: string;
}

interface NewMetricPageProps {
  location: Location<NewMetricPageQuery>;
  route: Route;
  urls?: MetricUrls;
  renderBreadcrumbs?: () => ReactNode;
  showAppSwitcher?: boolean;
  triggeredFrom?: "data_studio" | "main_app";
}

export function NewMetricPage({
  location,
  route,
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher = false,
  triggeredFrom = "main_app",
}: NewMetricPageProps) {
  const metadata = useSelector(getMetadata);
  const [name, setName] = useState("");
  const [datasetQuery, setDatasetQuery] = useState(() =>
    Lib.toJsQuery(getInitialQuery(metadata)),
  );
  const [uiState, setUiState] = useState(getInitialUiState);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const initialCollectionId = Urls.extractCollectionId(
    location.query.collectionId,
  );
  const defaultCollectionId = useGetDefaultCollectionId();
  const dispatch = useDispatch();

  const query = useMemo(
    () => getQuery(datasetQuery, metadata),
    [datasetQuery, metadata],
  );

  const resultMetadata = useMemo(() => {
    return getResultMetadata(
      datasetQuery,
      uiState.lastRunQuery,
      uiState.lastRunResult,
    );
  }, [datasetQuery, uiState.lastRunResult, uiState.lastRunQuery]);

  const validationResult = useMemo(() => getValidationResult(query), [query]);

  const defaultValues = useMemo(
    () => ({
      name: name === "" ? Lib.suggestedName(query) : name,
      result_metadata: resultMetadata,
      collection_id: initialCollectionId ?? defaultCollectionId,
    }),
    [name, query, resultMetadata, initialCollectionId, defaultCollectionId],
  );

  const handleCreate = (card: CardApiType) => {
    dispatch(push(urls.about(card.id)));
  };

  const handleChangeQuery = (query: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(query));
  };

  const handleCancel = () => {
    dispatch(goBack());
  };

  return (
    <>
      <PageContainer pos="relative" data-testid="metric-query-editor">
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
        <Card withBorder p={0} flex={1}>
          <MetricQueryEditor
            query={query}
            uiState={uiState}
            onChangeQuery={handleChangeQuery}
            onChangeUiState={setUiState}
          />
        </Card>
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
      <LeaveRouteConfirmModal route={route} isEnabled={!isModalOpened} />
    </>
  );
}
