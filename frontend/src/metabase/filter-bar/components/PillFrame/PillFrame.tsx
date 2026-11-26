import type { ReactNode } from "react";
import { t } from "ttag";

import { ActionIcon, Flex, Icon } from "metabase/ui";

import S from "./PillFrame.module.css";

type PillFrameProps = {
  isSelected?: boolean;
  isEditing?: boolean;
  hasError?: boolean;
  pl?: "xxs" | "sm";
  children: ReactNode;
  onRemove: () => void;
};

export const PillFrame = ({
  isSelected = false,
  isEditing = false,
  hasError = false,
  pl = "xxs",
  children,
  onRemove,
}: PillFrameProps) => (
  <Flex
    className={S.frame}
    component="span"
    align="center"
    gap="xxs"
    py="xxs"
    pr="xs"
    pl={pl}
    bdrs="lg"
    bg="background_surface-primary"
    data-testid={isEditing ? undefined : "filter-pill"}
    data-selected={isSelected || undefined}
    data-editing={isEditing || undefined}
    data-error={hasError || undefined}
  >
    {children}
    <ActionIcon
      size="xs"
      variant="subtle"
      aria-label={t`Remove filter`}
      contentEditable={false}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
    >
      <Icon name="close" />
    </ActionIcon>
  </Flex>
);
