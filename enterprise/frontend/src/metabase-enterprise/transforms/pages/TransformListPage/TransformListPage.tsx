import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import type { TransformListPageProps } from "metabase/plugins";
import { Flex } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";

import { TransformList } from "./TransformList";
import S from "./TransformListPage.module.css";
import { COLUMN_CONFIG } from "./constrants";

export function TransformListPage({ params }: TransformListPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const { data: transforms = [], isLoading, error } = useListTransformsQuery();

  return (
    <>
      <Flex
        className={S.column}
        flex={COLUMN_CONFIG.list.flex}
        direction="column"
        h="100%"
        justify={error ? "center" : undefined}
        miw={COLUMN_CONFIG.list.min}
        maw={COLUMN_CONFIG.list.max}
      >
        <LoadingAndErrorWrapper loading={isLoading} error={error}>
          <TransformList transforms={transforms} transformId={transformId} />
        </LoadingAndErrorWrapper>
      </Flex>
    </>
  );
}
