import cx from "classnames";
import type { HTMLAttributes, MouseEvent, Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import { Flex, Icon } from "metabase/ui";

import S from "./FilterPill.module.css";

interface FilterPillProps extends HTMLAttributes<HTMLDivElement> {
  onRemoveClick?: () => void;
  readOnly?: boolean;
}

export const FilterPill = forwardRef(function FilterPill(
  { children, onRemoveClick, readOnly, ...props }: FilterPillProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleRemoveClick = (event: MouseEvent) => {
    event.stopPropagation();
    onRemoveClick?.();
  };

  return (
    <Flex
      {...props}
      ref={ref}
      className={cx(S.root, { [S.readOnly]: readOnly })}
      align="center"
      gap="sm"
      px="sm"
      lh="1.5rem"
      fw="bold"
      data-testid="filter-pill"
    >
      {children}
      {onRemoveClick && !readOnly && (
        <Icon
          className={S.icon}
          name="close"
          size={12}
          role="button"
          aria-label={t`Remove`}
          onClick={handleRemoveClick}
        />
      )}
    </Flex>
  );
});
