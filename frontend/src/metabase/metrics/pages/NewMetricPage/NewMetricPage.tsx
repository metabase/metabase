import { useDisclosure } from "@mantine/hooks";
import type { Location } from "history";
import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import { EditableText } from "metabase/common/components/EditableText";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { getResultMetadata } from "metabase/data-studio/common/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { MetricQueryEditor } from "metabase/metrics/components/MetricQueryEditor";
import { getValidationResult } from "metabase/metrics/utils/validation";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Box,
  Button,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Tooltip,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Card as CardType } from "metabase-types/api";

import { CreateMetricModal } from "./CreateMetricModal";
import { getInitialQuery, getQuery } from "./utils";

const NAME_MAX_LENGTH = 254;

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
    dispatch(push(Urls.metric(card)));
  };

  const handleChangeQuery = (query: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(query));
  };

  const handleCancel = () => {
    dispatch(push("/"));
  };

  const canSave = validationResult.isValid;

  return (
    <>
      <PageContainer pos="relative" data-testid="new-metric-page">
        <Stack gap={0} pt="xs">
          <Box mb="lg" mt="md" />
          <Group gap="sm" justify="space-between" wrap="nowrap">
            <Group align="center" gap="sm" wrap="nowrap">
              <FixedSizeIcon name="metric" c="brand" size={20} />
              <EditableText
                initialValue={name}
                placeholder={t`New metric`}
                maxLength={NAME_MAX_LENGTH}
                p={0}
                fw="bold"
                fz="h3"
                lh="h3"
                isOptional
                onChange={setName}
              />
            </Group>
            <Group wrap="nowrap">
              <Button onClick={handleCancel}>{t`Cancel`}</Button>
              <Tooltip
                label={validationResult.errorMessage}
                disabled={validationResult.errorMessage == null}
              >
                <Button
                  variant="filled"
                  disabled={!canSave}
                  onClick={openModal}
                >
                  {t`Save`}
                </Button>
              </Tooltip>
            </Group>
          </Group>
        </Stack>
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
          triggeredFrom="main_app"
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
      <LeaveRouteConfirmModal route={route} isEnabled={!isModalOpened} />
    </>
  );
}
