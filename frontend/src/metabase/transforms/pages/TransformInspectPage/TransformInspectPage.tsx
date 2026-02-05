import type { Location } from "history";
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
import { Button, Center, Stack, Text } from "metabase/ui";

import { TransformHeader } from "../../components/TransformHeader";

import { LensContent } from "./components";
import { LensNavigator, useLensNavigation } from "./components/LensNavigator";

type TransformInspectPageProps = {
  params: { transformId: string };
  location: Location;
};

export const TransformInspectPage = ({
  params,
  location,
}: TransformInspectPageProps) => {
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

  const {
    tabs,
    activeTabKey,
    currentLensRef,
    addDrillLens,
    closeTab,
    switchTab,
  } = useLensNavigation(discovery?.available_lenses ?? [], location);

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
      <LensNavigator
        tabs={tabs}
        activeTabKey={activeTabKey}
        onSwitchTab={switchTab}
        onCloseTab={closeTab}
      >
        <LensContent
          transformId={transform.id}
          currentLensRef={currentLensRef}
          discovery={discovery}
          onDrill={addDrillLens}
        />
      </LensNavigator>
    </PageContainer>
  );
};
