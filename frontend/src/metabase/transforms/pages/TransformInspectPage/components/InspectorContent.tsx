import type { Location } from "history";

import { useGetInspectorDiscoveryQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";
import type { Transform } from "metabase-types/api";

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

  const { tabs, activeTabKey, currentLens, addDrillLens, closeTab, switchTab } =
    useLensNavigation(discovery?.available_lenses ?? [], location);

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
      onCloseTab={closeTab}
    >
      <LensContent
        transformId={transform.id}
        currentLens={currentLens}
        discovery={discovery}
        onDrill={addDrillLens}
      />
    </LensNavigator>
  );
};
