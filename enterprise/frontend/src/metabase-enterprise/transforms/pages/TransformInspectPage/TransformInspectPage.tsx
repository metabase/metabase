import { Link } from "react-router";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Button, Center, Stack, Text } from "metabase/ui";
import {
  useGetTransformInspectQuery,
  useGetTransformQuery,
} from "metabase-enterprise/api";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";

import { TransformHeader } from "../../components/TransformHeader";

import {
  InspectColumnComparisons,
  InspectJoins,
  InspectSummary,
} from "./components";

type TransformInspectPageParams = {
  transformId: string;
};

type TransformInspectPageProps = {
  params: TransformInspectPageParams;
};

export const TransformInspectPage = ({ params }: TransformInspectPageProps) => {
  const transformId = Urls.extractEntityId(params.transformId);

  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(transformId ?? skipToken);

  const {
    data: inspectData,
    isLoading: isLoadingInspect,
    error: inspectError,
  } = useGetTransformInspectQuery(transformId ?? skipToken);

  const isLoading = isLoadingTransform || isLoadingInspect;
  const error = transformError ?? inspectError;

  if (isLoading || error || transform == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (inspectData == null || inspectData.status === "not-run") {
    return (
      <PageContainer data-testid="transform-inspect-content">
        <TransformHeader transform={transform} />
        <Center h="100%" style={{ flex: 1 }}>
          <Stack align="center" gap="md">
            <Text c="text-secondary">
              {t`To inspect the transform you need to run it first.`}
            </Text>
            <Button component={Link} to={Urls.transformRun(transform.id)}>
              {t`Go to Run`}
            </Button>
          </Stack>
        </Center>
      </PageContainer>
    );
  }
  return (
    <PageContainer data-testid="transform-inspect-content">
      <TransformHeader transform={transform} />
      <Stack gap="xl">
        {inspectData.summary && (
          <InspectSummary
            summary={inspectData.summary}
            joins={inspectData.joins}
            sources={inspectData.sources}
          />
        )}
        {inspectData.joins && inspectData.joins.length > 0 && (
          <InspectJoins
            joins={inspectData.joins}
            sources={inspectData.sources ?? undefined}
          />
        )}
        {inspectData.column_comparisons &&
          inspectData.column_comparisons.length > 0 && (
            <InspectColumnComparisons
              comparisons={inspectData.column_comparisons}
              sources={inspectData.sources}
              target={inspectData.target}
              visitedFields={inspectData.visited_fields}
            />
          )}
      </Stack>
    </PageContainer>
  );
};
