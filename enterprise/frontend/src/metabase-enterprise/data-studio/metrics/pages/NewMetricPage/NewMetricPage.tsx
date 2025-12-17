import { useDisclosure } from "@mantine/hooks";
import type { Location } from "history";
import { useMemo, useState } from "react";
import { Link, type Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Card } from "metabase/ui";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { getResultMetadata } from "metabase-enterprise/data-studio/common/utils";
import * as Lib from "metabase-lib";
import type { Card as CardType } from "metabase-types/api";

import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "../../../common/components/PaneHeader";
import { MetricQueryEditor } from "../../components/MetricQueryEditor";
import { NAME_MAX_LENGTH } from "../../constants";
import { getValidationResult } from "../../utils";

import { CreateMetricModal } from "./CreateMetricModal";
import { getInitialQuery, getQuery } from "./utils";

type NewMetricPageQuery = {
  collectionId?: string;
};

type NewMetricPageProps = {
  location: Location<NewMetricPageQuery>;
  route: Route;
};

export function NewMetricPage({ location, route }: NewMetricPageProps) {
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
      name,
      result_metadata: resultMetadata,
      collection_id: initialCollectionId ?? defaultCollectionId,
    }),
    [name, resultMetadata, initialCollectionId, defaultCollectionId],
  );

  const handleCreate = (card: CardType) => {
    dispatch(push(Urls.dataStudioMetric(card.id)));
  };

  const handleChangeQuery = (query: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(query));
  };

  const handleCancel = () => {
    dispatch(push(Urls.dataStudioLibrary()));
  };

  return (
    <>
      <PageContainer pos="relative" data-testid="metric-query-editor">
        <PaneHeader
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
            <DataStudioBreadcrumbs>
              <Link to={Urls.dataStudioLibrary()}>{t`Library`}</Link>
              {t`New Metric`}
            </DataStudioBreadcrumbs>
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
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
      <LeaveRouteConfirmModal route={route} isEnabled={!isModalOpened} />
    </>
  );
}
