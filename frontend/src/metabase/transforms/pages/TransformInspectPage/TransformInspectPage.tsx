import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  skipToken,
  useGetInspectorDiscoveryQuery,
  useGetTransformQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import * as Urls from "metabase/lib/urls";
import { Box, Button, Center, Flex, Stack, Text } from "metabase/ui";

import { TransformHeader } from "../../components/TransformHeader";

import { LensContent, LensNavigation } from "./components";
import { useLensNavigation } from "./hooks";
import { convertLensToRef } from "./utils";

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
    data: discovery,
    isLoading: isLoadingDiscovery,
    error: discoveryError,
  } = useGetInspectorDiscoveryQuery(transformId ?? skipToken);

  const availableLenses = useMemo(
    () => discovery?.available_lenses ?? [],
    [discovery],
  );

  const rootSiblings = useMemo(
    () => availableLenses.map(convertLensToRef),
    [availableLenses],
  );

  const initialLensRef = useMemo(() => {
    const initialLens = availableLenses[0];
    return initialLens ? convertLensToRef(initialLens) : undefined;
  }, [availableLenses]);

  const {
    currentLensRef,
    parentSiblings,
    currentSiblings,
    drillLenses,
    setDrillLenses,
    drill,
    zoomOut,
    setCurrentLens,
    selectParentLens,
    canZoomOut,
  } = useLensNavigation(initialLensRef, rootSiblings);

  const isLoading = isLoadingTransform || isLoadingDiscovery;
  const error = transformError ?? discoveryError;

  if (isLoading || error || transform == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (!discovery || discovery.status === "not-run") {
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

  if (!currentLensRef) {
    return null;
  }

  return (
    <PageContainer data-testid="transform-inspect-content">
      <TransformHeader transform={transform} />
      <Flex gap="xl">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <LensContent
            transformId={transform.id}
            currentLensRef={currentLensRef}
            discovery={discovery}
            onDrill={drill}
            onDrillLensesChange={setDrillLenses}
          />
        </Box>
        <LensNavigation
          currentLensRef={currentLensRef}
          parentLenses={parentSiblings}
          siblingLenses={currentSiblings}
          drillLenses={drillLenses}
          canZoomOut={canZoomOut}
          onZoomOut={zoomOut}
          onSelectLens={setCurrentLens}
          onSelectParentLens={selectParentLens}
          onDrill={drill}
        />
      </Flex>
    </PageContainer>
  );
};
