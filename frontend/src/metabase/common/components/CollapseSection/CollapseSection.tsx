import cx from "classnames";
import {
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useId,
  useState,
} from "react";

import { Flex, Icon, rem } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./CollapseSection.module.css";

type IconVariant = "right-down" | "up-down";

const ICON_VARIANTS: Record<
  IconVariant,
  { collapsed: IconName; expanded: IconName }
> = {
  "right-down": {
    collapsed: "chevronright",
    expanded: "chevrondown",
  },
  "up-down": {
    collapsed: "chevrondown",
    expanded: "chevronup",
  },
};

type CollapseSectionProps = {
  children?: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
  headerClass?: string;
  bodyClass?: string;
  initialState?: "expanded" | "collapsed";
  iconVariant?: IconVariant;
  iconPosition?: "left" | "right";
  iconSize?: number;
  onToggle?: (nextState: boolean) => void;
  rightAction?: React.ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "onToggle">;

export const CollapseSection = ({
  initialState = "collapsed",
  iconVariant = "right-down",
  iconPosition = "left",
  iconSize = 12,
  header,
  headerClass,
  className,
  bodyClass,
  children,
  onToggle,
  rightAction,
  ...props
}: CollapseSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(initialState === "expanded");
  const buttonId = useId();
  const regionId = useId();

  const toggle = useCallback(() => {
    const nextState = !isExpanded;
    setIsExpanded(!isExpanded);
    onToggle?.(nextState);
  }, [isExpanded, onToggle]);

  const handleRightActionClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
    },
    [],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.nativeEvent.isComposing) {
        return;
      }
      if (e.key === "Enter") {
        toggle();
      }
    },
    [toggle],
  );

  const { collapsed, expanded } = ICON_VARIANTS[iconVariant];
  const headerIcon = (
    <Icon name={isExpanded ? expanded : collapsed} size={iconSize} />
  );

  return (
    <div className={className} {...props}>
      <Flex
        id={buttonId}
        className={cx(S.header, headerClass)}
        role="button"
        tabIndex={0}
        align="center"
        mih={rem(28)}
        aria-expanded={isExpanded}
        aria-controls={regionId}
        onKeyDown={onKeyDown}
        onClick={toggle}
      >
        <Flex align="center" flex={1} gap="sm">
          {iconPosition === "left" && headerIcon}
          <Flex component="span" align="center">
            {header}
          </Flex>
          {iconPosition === "right" && headerIcon}
        </Flex>
        {rightAction && (
          <div onClick={handleRightActionClick}>{rightAction}</div>
        )}
      </Flex>
      {isExpanded && (
        <div
          id={regionId}
          role="region"
          aria-labelledby={buttonId}
          className={bodyClass}
        >
          {children}
        </div>
      )}
    </div>
  );
};
