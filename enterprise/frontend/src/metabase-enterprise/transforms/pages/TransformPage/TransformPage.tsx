import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex, Stack } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import type { TransformId } from "metabase-types/api";

import { ManageSection } from "./ManageSection";
import { NameSection } from "./NameSection";
import { TargetSection } from "./TargetSection";
import S from "./TransformPage.module.css";

type TransformPageParams = {
  transformId: string;
};

type TransformPageParsedParams = {
  transformId?: TransformId;
};

type TransformPageProps = {
  params: TransformPageParams;
};

export function TransformPage({ params }: TransformPageProps) {
  const { transformId } = getParsedParams(params);
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(transformId ?? skipToken);

  if (isLoading || error != null) {
    return (
      <Center>
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (transform == null) {
    return (
      <Center>
        <LoadingAndErrorWrapper error={t`No transform found.`} />
      </Center>
    );
  }

  return (
    <Flex
      className={S.root}
      flex={1}
      h="100%"
      direction="column"
      align="center"
      p="xl"
    >
      <Stack w="100%" maw="60rem" gap="5rem">
        <NameSection transform={transform} />
        <ManageSection transform={transform} />
        <TargetSection transform={transform} />
      </Stack>
    </Flex>
  );
}

export function getParsedParams({
  transformId,
}: TransformPageParams): TransformPageParsedParams {
  return {
    transformId: Urls.extractEntityId(transformId),
  };
}
