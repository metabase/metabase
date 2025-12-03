import type { ReactNode } from "react";

import { Box, Loader } from "metabase/ui";

import S from "./SuggestionPaper.module.css";

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
    className={S.suggestionPaper}
    data-testid="mention-suggestions-popup"
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
    className={S.suggestionPaper}
    data-testid="mention-suggestions-popup"
  >
    <Loader size="sm" />
  </Box>
);
