import { forwardRef } from "react";
import { t } from "ttag";

import { ActionIcon, Flex, type FlexProps, Icon } from "metabase/ui";

export interface WellItemProps extends FlexProps {
  onRemove?: () => void;
}

export const WellItem = forwardRef<HTMLDivElement, WellItemProps>(
  function WellItem({ children, style, onRemove, ...props }, ref) {
    return (
      <Flex
        direction="row"
        align="center"
        bg="var(--mb-color-bg-white)"
        px="sm"
        {...props}
        style={{
          ...style,
          borderRadius: "var(--border-radius-xl)",
          border: `1px solid var(--mb-color-border)`,
          boxShadow: "0 0 1px var(--mb-color-shadow)",
        }}
        ref={ref}
      >
        <div>{children}</div>
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
