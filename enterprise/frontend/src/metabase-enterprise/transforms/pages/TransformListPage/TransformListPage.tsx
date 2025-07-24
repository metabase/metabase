import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import type { TransformListPageProps } from "metabase/plugins";
import { Flex } from "metabase/ui";
import {
  useGetTransformQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";

import { TransformList } from "./TransformList";
import S from "./TransformListPage.module.css";
import { TransformSettings } from "./TransformSettings";
import { COLUMN_CONFIG } from "./constrants";

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

  return (
    <>
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
      {transformId != null && transform != null && (
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
            <TransformSettings transform={transform} />
          </LoadingAndErrorWrapper>
        </Flex>
      )}
    </>
  );
}
