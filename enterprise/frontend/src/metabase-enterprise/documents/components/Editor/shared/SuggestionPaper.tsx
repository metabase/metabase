import type { ReactNode } from "react";

import { Box, Loader } from "metabase/ui";

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
  <Box
    aria-label={ariaLabel}
    role="dialog"
    style={{
      minHeight: "fit-content",
    }}
  >
    {children}
  </Box>
);

export const LoadingSuggestionPaper = ({
  "aria-label": ariaLabel,
}: LoadingSuggestionPaperProps) => (
  <Box
    aria-label={ariaLabel}
    ta="center"
    py="lg"
    style={{
      minHeight: "fit-content",
    }}
  >
    <Loader size="sm" />
  </Box>
);
