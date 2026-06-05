import { memo } from "react";

import { skipToken, useGetCardQuery, useGetDatabaseQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Box, Center, Stack } from "metabase/ui";
import { SidebarResizableBox } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/SidebarResizableBox";
import type { CardId } from "metabase-types/api";

import { ActionSection } from "./ActionSection";
import { DependentsSection } from "./DependentsSection";
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
  const {
    data: card,
    isLoading: isCardLoading,
    error: cardError,
  } = useGetCardQuery({ id: cardId });

  const {
    data: database,
    isLoading: isDatabaseLoading,
    error: databaseError,
  } = useGetDatabaseQuery(
    card?.database_id != null ? { id: card.database_id } : skipToken,
  );

  const isLoading = isCardLoading || isDatabaseLoading;
  const error = cardError ?? databaseError;

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
        {isLoading || error != null || card == null || database == null ? (
          <Center>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <Stack gap="xl">
            <Stack gap="lg">
              <SidebarHeader card={card} onClose={onClose} />
              <LocationSection card={card} />
              <ActionSection card={card} database={database} />
              <InfoSection card={card} />
            </Stack>
            <DependentsSection cardId={cardId} />
          </Stack>
        )}
      </Box>
    </SidebarResizableBox>
  );
});
