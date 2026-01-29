import { useEffect, useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Stack, Text, Title } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";

import { TransformHeader } from "../../components/TransformHeader";

import { InspectSummaryMock } from "./components/InspectSummaryMock";
import { fetchTransformInspect } from "./mock-api";
import type { TransformInspectResponse } from "./mock-types";

type TransformInspectPageMockParams = {
  transformId: string;
};

type TransformInspectPageMockProps = {
  params: TransformInspectPageMockParams;
};

export const TransformInspectPageMock = ({
  params,
}: TransformInspectPageMockProps) => {
  const transformId = Urls.extractEntityId(params.transformId);

  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(transformId ?? skipToken);

  const [data, setData] = useState<TransformInspectResponse | null>(null);
  const [isLoadingMock, setIsLoadingMock] = useState(true);
  const [mockError, setMockError] = useState<Error | null>(null);

  useEffect(() => {
    if (transformId == null) {
      return;
    }
    setIsLoadingMock(true);
    setMockError(null);

    fetchTransformInspect(transformId)
      .then((response) => {
        setData(response);
        setIsLoadingMock(false);
      })
      .catch((err) => {
        setMockError(err);
        setIsLoadingMock(false);
      });
  }, [transformId]);

  const isLoading = isLoadingTransform || isLoadingMock;
  const error = transformError ?? mockError;

  if (isLoading || error || transform == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (data == null) {
    return null;
  }

  return (
    <PageContainer data-testid="transform-inspect-mock-content">
      <TransformHeader transform={transform} />
      <Stack gap="xl">
        <InspectSummaryMock sources={data.sources} target={data.target} />

        <Stack gap="md">
          <Title order={4}>{t`Available Lenses`}</Title>
          {data["available-lenses"].map((lens) => (
            <Stack key={lens.id} gap="xs">
              <Text fw="bold">{lens["display-name"]}</Text>
              <Text c="text-secondary">{lens.description}</Text>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </PageContainer>
  );
};
