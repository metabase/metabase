import { memo } from "react";

import { useGetCardQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Box, Center, Stack } from "metabase/ui";
import { SidebarResizableBox } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/SidebarResizableBox";
import type { CardId } from "metabase-types/api";

import { ActionSection } from "./ActionSection";
import { InfoSection } from "./InfoSection";
import { LocationSection } from "./LocationSection";
import S from "./ModelSidebar.module.css";
import { SidebarHeader } from "./SidebarHeader";

type ModelSidebarProps = {
  cardId: CardId;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const ModelSidebar = memo(function ModelSidebar({
  cardId,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: ModelSidebarProps) {
  const { data: card, isLoading, error } = useGetCardQuery({ id: cardId });

  return (
    <SidebarResizableBox
      containerWidth={containerWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      <Box
        className={S.sidebar}
        p="lg"
        bg="background-primary"
        data-testid="model-sidebar"
      >
        {isLoading || error != null || card == null ? (
          <Center>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <Stack gap="lg">
            <SidebarHeader card={card} onClose={onClose} />
            <LocationSection card={card} />
            <ActionSection card={card} />
            <InfoSection card={card} />
          </Stack>
        )}
      </Box>
    </SidebarResizableBox>
  );
});
