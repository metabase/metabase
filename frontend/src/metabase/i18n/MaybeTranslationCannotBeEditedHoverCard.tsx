import type { ReactNode } from "react";
import { t } from "ttag";

import { Box, HoverCard } from "metabase/ui";

export const MaybeTranslationCannotBeEditedHoverCard = ({
  isLocalized,
  children,
}: {
  isLocalized?: boolean;
  children: ReactNode;
}) => {
  return (
    <HoverCard offset={0} position="bottom-start" disabled={!isLocalized}>
      <HoverCard.Target>{children}</HoverCard.Target>
      <HoverCard.Dropdown>
        <Box
          bg="var(--mb-color-background-inverse)"
          c="white"
          p="md"
        >{t`This translation cannot be edited here`}</Box>
      </HoverCard.Dropdown>
    </HoverCard>
  );
};
