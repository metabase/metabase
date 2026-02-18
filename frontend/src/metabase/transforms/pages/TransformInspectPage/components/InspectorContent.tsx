import type { Location } from "history";
import { useCallback } from "react";

import { useGetInspectorDiscoveryQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { trackTransformInspectDrillLensClosed } from "metabase/transforms/analytics";
import { Center } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { getLensKey } from "../utils";

import { LensContent } from "./LensContent/LensContent";
import { LensNavigator, useLensNavigation } from "./LensNavigator";

type InspectorContentProps = {
  transform: Transform;
  location: Location;
};

export const InspectorContent = ({
  transform,
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
    currentLens,
    addDrillLens,
    closeTab,
    switchTab,
    markLensAsLoaded,
  } = useLensNavigation(discovery?.available_lenses ?? [], location);

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

  if (!currentLens) {
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
        key={getLensKey(currentLens)}
        transform={transform}
        currentLens={currentLens}
        discovery={discovery}
        onDrill={addDrillLens}
        onAllCardsLoaded={markLensAsLoaded}
      />
    </LensNavigator>
  );
};
