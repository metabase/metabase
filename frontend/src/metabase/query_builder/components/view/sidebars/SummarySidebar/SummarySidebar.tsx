import { useId, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Box, Flex, Icon, Tooltip } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { SummaryFieldList } from "./SummaryFieldList";
import S from "./SummarySidebar.module.css";

type SummarySidebarProps = {
  query: Lib.Query;
  stageIndex: number;
};

/**
 * The summary sidebar: the wells the summary is built in on the left (to come), and on the right
 * a drawer with the fields to build it from, which slides out of the panel when hidden.
 */
export function SummarySidebar({ query, stageIndex }: SummarySidebarProps) {
  const [isFieldListOpen, setIsFieldListOpen] = useState(true);
  const fieldListDrawerId = useId();
  const fieldListToggleLabel = isFieldListOpen
    ? t`Hide fields`
    : t`Show fields`;

  return (
    <Box className={S.sidebar} data-testid="summary-sidebar">
      <Box className={S.wellsColumn}>
        <Box className={S.wells} data-testid="summary-wells" />
        <Flex className={S.wellsFooter} align="center" justify="flex-end">
          <Tooltip label={fieldListToggleLabel}>
            <ActionIcon
              variant="subtle"
              aria-label={fieldListToggleLabel}
              aria-expanded={isFieldListOpen}
              aria-controls={fieldListDrawerId}
              onClick={() => setIsFieldListOpen(!isFieldListOpen)}
            >
              <Icon
                name={isFieldListOpen ? "sidebar_open" : "sidebar_closed"}
              />
            </ActionIcon>
          </Tooltip>
        </Flex>
      </Box>
      <Box
        id={fieldListDrawerId}
        className={S.fieldListDrawer}
        data-open={isFieldListOpen || undefined}
        data-testid="summary-field-list-drawer"
      >
        <SummaryFieldList query={query} stageIndex={stageIndex} />
      </Box>
    </Box>
  );
}
