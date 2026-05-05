import type { Location } from "history";
import { useCallback } from "react";

import { useGetInspectorDiscoveryQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { trackTransformInspectDrillLensClosed } from "metabase/transforms/analytics";
import { Center } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import type { RouteParams } from "../types";

import { LensContent } from "./LensContent/LensContent";
import { LensNavigator, useLensNavigation } from "./LensNavigator";
import { getLensKey } from "./LensNavigator/utils";

type InspectorContentProps = {
  transform: Transform;
  params: RouteParams;
  location: Location;
};

export const InspectorContent = ({
  transform,
  params,
  location,
}: InspectorContentProps) => {
  const {
    data: discovery,
    isLoading: isLoadingDiscovery,
    error: discoveryError,
  } = useGetInspectorDiscoveryQuery(transform.id);

  const {
    tabs,
    activeTabKey,
    currentLensHandle,
    navigateToLens,
    closeTab,
    switchTab,
    markLensAsLoaded,
    updateTabTitle,
    onLensError,
  } = useLensNavigation(discovery?.available_lenses ?? [], params, location);

  const handleCloseTab = useCallback(
    (tabKey: string) => {
      trackTransformInspectDrillLensClosed({
        transformId: transform.id,
        lensId: tabKey,
      });
      closeTab(tabKey);
    },
    [transform.id, closeTab],
  );

  if (isLoadingDiscovery || discoveryError || !discovery) {
    return (
      <Center h="100%" style={{ flex: 1 }}>
        <LoadingAndErrorWrapper
          loading={isLoadingDiscovery}
          error={discoveryError}
        />
      </Center>
    );
  }

  if (!currentLensHandle) {
    return null;
  }

  return (
    <LensNavigator
      tabs={tabs}
      activeTabKey={activeTabKey}
      onSwitchTab={switchTab}
      onCloseTab={handleCloseTab}
    >
      <LensContent
        key={getLensKey(currentLensHandle)}
        transform={transform}
        lensHandle={currentLensHandle}
        discovery={discovery}
        navigateToLens={navigateToLens}
        onAllCardsLoaded={markLensAsLoaded}
        onTitleResolved={updateTabTitle}
        onError={onLensError}
      />
    </LensNavigator>
  );
};
