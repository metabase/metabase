import { forwardRef } from "react";
import { t } from "ttag";

import { ActionIcon, Flex, type FlexProps, Icon } from "metabase/ui";

export interface WellItemProps extends FlexProps {
  onRemove?: () => void;

  highlightedForDrag?: boolean;
  vertical?: boolean;
}

export const WellItem = forwardRef<HTMLDivElement, WellItemProps>(
  function WellItem(
    { children, style, onRemove, highlightedForDrag, vertical, ...props },
    ref,
  ) {
    return (
      <Flex
        direction="row"
        align="center"
        bg="background-primary"
        px="sm"
        data-testid="well-item"
        {...props}
        style={{
          borderRadius: "var(--border-radius-xl)",
          border: `1px solid var(--mb-color-border)`,
          boxShadow: "0 0 1px var(--mb-color-shadow)",
          cursor: "grab",
          userSelect: "none",

          ...(highlightedForDrag
            ? {
                border: "2px solid var(--mb-color-brand)",
                boxShadow: "0px 1px 4px 1px var(--mb-color-shadow)",
                cursor: "grab",
                backgroundColor: "var(--mb-color-background-secondary)",
                borderRadius: "var(--border-radius-xl)",
              }
            : {}),

          ...(vertical
            ? {
                transform: "rotate(-90deg)",
              }
            : {}),
        }}
        ref={ref}
      >
        {children}
        {!!onRemove && (
          <ActionIcon
            aria-label={t`Remove`}
            size="sm"
            ml="xs"
            onClick={onRemove}
          >
            <Icon name="close" size="0.8rem" />
          </ActionIcon>
        )}
      </Flex>
    );
  },
);
