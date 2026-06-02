import { autoUpdate, offset, useFloating } from "@floating-ui/react";
import { useState } from "react";
import { t } from "ttag";

import MetabotFailure from "assets/img/metabot-failure.svg?component";
import ErrorBoundary from "metabase/ErrorBoundary";
import { MetabotChat } from "metabase/metabot/components/MetabotChat";
import type { MetabotAgentId } from "metabase/metabot/state";
import { Box, Button, Text } from "metabase/ui";

import S from "./MetabotBar.module.css";

interface MetabotPanelProps {
  agentId: MetabotAgentId;
  anchorEl: HTMLElement | null;
}

const PanelFallback = ({ onRetry }: { onRetry: () => void }) => (
  <Box className={S.panelFallback} data-testid="metabot-error-fallback">
    <Box component={MetabotFailure} w="6rem" />
    <Text c="text-tertiary" maw="12rem" ta="center">
      {t`Something went wrong.`}
    </Text>
    <Button
      variant="subtle"
      size="compact-lg"
      onClick={onRetry}
      data-testid="metabot-error-retry"
    >
      {t`Try again`}
    </Button>
  </Box>
);

export const MetabotPanel = ({ agentId, anchorEl }: MetabotPanelProps) => {
  const [errorBoundaryKey, setErrorBoundaryKey] = useState(0);
  const { refs, floatingStyles } = useFloating({
    placement: "top-end",
    strategy: "fixed",
    middleware: [offset(12)],
    whileElementsMounted: autoUpdate,
    elements: { reference: anchorEl ?? undefined },
  });

  const handleRetry = () => setErrorBoundaryKey((prev) => prev + 1);

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className={S.panel}
      data-testid="metabot-panel"
    >
      <ErrorBoundary
        key={errorBoundaryKey}
        errorComponent={() => <PanelFallback onRetry={handleRetry} />}
      >
        <MetabotChat agentId={agentId} />
      </ErrorBoundary>
    </div>
  );
};
