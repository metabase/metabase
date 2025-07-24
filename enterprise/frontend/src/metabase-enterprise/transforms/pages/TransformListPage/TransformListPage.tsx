import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import type { TransformListPageProps } from "metabase/plugins";
import { Flex, rem } from "metabase/ui";
import {
  useGetTransformQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";

import { TransformEmptyState } from "./TransformEmptyState";
import { TransformList } from "./TransformList";
import S from "./TransformListPage.module.css";
import { TransformSettings } from "./TransformSettings";
import { COLUMN_CONFIG, EMPTY_STATE_MIN_WIDTH } from "./constrants";

export function TransformListPage({ params }: TransformListPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const {
    data: transforms = [],
    isLoading: isListLoading,
    error: listError,
  } = useListTransformsQuery();
  const {
    data: transform,
    isLoading: isItemLoading,
    error: itemError,
  } = useGetTransformQuery(transformId ?? skipToken);
  const isListEmptyState =
    transforms.length === 0 && !isListLoading && listError == null;
  const isItemEmptyState = transformId == null;

  return (
    <>
      {!isListEmptyState && (
        <Flex
          className={S.column}
          direction="column"
          h="100%"
          justify={listError ? "center" : undefined}
          flex={COLUMN_CONFIG.list.flex}
          miw={COLUMN_CONFIG.list.min}
          maw={COLUMN_CONFIG.list.max}
        >
          <LoadingAndErrorWrapper loading={isListLoading} error={listError}>
            <TransformList transforms={transforms} transformId={transformId} />
          </LoadingAndErrorWrapper>
        </Flex>
      )}
      {!isItemEmptyState && (
        <Flex
          className={S.column}
          direction="column"
          h="100%"
          justify={listError ? "center" : undefined}
          flex={COLUMN_CONFIG.item.flex}
          miw={COLUMN_CONFIG.item.min}
          maw={COLUMN_CONFIG.item.max}
        >
          <LoadingAndErrorWrapper loading={isItemLoading} error={itemError}>
            {transform != null && (
              <TransformSettings key={transform.id} transform={transform} />
            )}
          </LoadingAndErrorWrapper>
        </Flex>
      )}
      {(isListEmptyState || isItemEmptyState) && (
        <Flex
          align="center"
          flex="1"
          justify="center"
          miw={rem(EMPTY_STATE_MIN_WIDTH)}
        >
          <TransformEmptyState isListEmptyState={isListEmptyState} />
        </Flex>
      )}
    </>
  );
}
