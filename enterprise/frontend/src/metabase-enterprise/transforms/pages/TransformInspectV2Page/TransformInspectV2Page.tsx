import { Link } from "react-router";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Button, Center, Divider, Stack, Text } from "metabase/ui";
import {
  useGetInspectorV2DiscoveryQuery,
  useGetTransformQuery,
} from "metabase-enterprise/api";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import type { InspectorV2DiscoveryResponse, TransformId } from "metabase-types/api";

import { TransformHeader } from "../../components/TransformHeader";

import { LensContent } from "./components/LensContent";

type TransformInspectV2PageParams = {
  transformId: string;
};

type TransformInspectV2PageProps = {
  params: TransformInspectV2PageParams;
};

export const TransformInspectV2Page = ({
  params,
}: TransformInspectV2PageProps) => {
  const transformId = Urls.extractEntityId(params.transformId);

  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(transformId ?? skipToken);

  const {
    data: discovery,
    isLoading: isLoadingDiscovery,
    error: discoveryError,
  } = useGetInspectorV2DiscoveryQuery(transformId ?? skipToken);

  const isLoading = isLoadingTransform || isLoadingDiscovery;
  const error = transformError ?? discoveryError;

  if (isLoading || error || transform == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (discovery == null || discovery.status === "not-run") {
    return (
      <PageContainer data-testid="transform-inspect-v2-content">
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
    <PageContainer data-testid="transform-inspect-v2-content">
      <TransformHeader transform={transform} />
      <AllLensesContent
        transformId={transformId!}
        discovery={discovery}
      />
    </PageContainer>
  );
};

type AllLensesContentProps = {
  transformId: TransformId;
  discovery: InspectorV2DiscoveryResponse;
};

const AllLensesContent = ({ transformId, discovery }: AllLensesContentProps) => {
  const availableLenses = discovery.available_lenses;

  return (
    <Stack gap="xl">
      {availableLenses.map((lens, index) => (
        <Stack key={lens.id} gap="lg">
          {index > 0 && <Divider />}
          <LensContent
            transformId={transformId}
            lensId={lens.id}
            discovery={discovery}
          />
        </Stack>
      ))}
    </Stack>
  );
};
