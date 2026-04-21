import {
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useId,
  useState,
} from "react";

import {
  Header,
  HeaderContainer,
  HeaderContent,
  ToggleIcon,
} from "./CollapseSection.styled";

type CollapseSectionProps = {
  children?: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
  headerClass?: string;
  bodyClass?: string;
  initialState?: "expanded" | "collapsed";
  iconVariant?: "right-down" | "up-down";
  iconPosition?: "left" | "right";
  iconSize?: number;
  onToggle?: (nextState: boolean) => void;
  rightAction?: React.ReactNode;
} & HTMLAttributes<HTMLDivElement>;

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

  const HeaderIcon = (
    <ToggleIcon
      isExpanded={isExpanded}
      variant={iconVariant}
      position={iconPosition}
      size={iconSize}
    />
  );

  return (
    <div className={className} {...props}>
      <HeaderContainer
        id={buttonId}
        className={headerClass}
        hasRightAction={!!rightAction}
        aria-expanded={isExpanded}
        aria-controls={regionId}
        onKeyDown={onKeyDown}
        onClick={toggle}
      >
        <HeaderContent>
          {iconPosition === "left" && HeaderIcon}
          <Header>{header}</Header>
          {iconPosition === "right" && HeaderIcon}
        </HeaderContent>
        {rightAction && (
          <div onClick={handleRightActionClick}>{rightAction}</div>
        )}
      </HeaderContainer>
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
