import type { ReactNode } from "react";

import { Box, Loader, Paper } from "metabase/ui";

interface SuggestionPaperProps {
  children: ReactNode;
  "aria-label": string;
}

interface LoadingSuggestionPaperProps {
  "aria-label"?: string;
}

export const SuggestionPaper = ({
  children,
  "aria-label": ariaLabel,
}: SuggestionPaperProps) => (
  <Paper
    shadow="md"
    radius="md"
    withBorder
    w={320}
    aria-label={ariaLabel}
    role="dialog"
    styles={{
      root: {
        backgroundColor: "var(--mb-color-background)",
        borderColor: "var(--mb-color-border)",
        padding: "0.75rem",
        overflow: "auto",
        maxHeight: "400px",
      },
    }}
  >
    {children}
  </Paper>
);

export const LoadingSuggestionPaper = ({
  "aria-label": ariaLabel,
}: LoadingSuggestionPaperProps) => (
  <Paper
    shadow="md"
    radius="md"
    withBorder
    w={320}
    aria-label={ariaLabel}
    styles={{
      root: {
        backgroundColor: "var(--mb-color-background)",
        borderColor: "var(--mb-color-border)",
        padding: "0.75rem",
      },
    }}
  >
    <Box ta="center" py="lg">
      <Loader size="sm" />
    </Box>
  </Paper>
);
