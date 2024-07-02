import {
  useCallback,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";

import { Header, HeaderContainer, ToggleIcon } from "./CollapseSection.styled";

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
} & HTMLAttributes<HTMLDivElement>;

const CollapseSection = ({
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
  ...props
}: CollapseSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(initialState === "expanded");

  const toggle = useCallback(() => {
    const nextState = !isExpanded;
    setIsExpanded(!isExpanded);
    onToggle?.(nextState);
  }, [isExpanded, onToggle]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
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
    <div className={className} role="tab" aria-expanded={isExpanded} {...props}>
      <HeaderContainer
        className={headerClass}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        {iconPosition === "left" && HeaderIcon}
        <Header>{header}</Header>
        {iconPosition === "right" && HeaderIcon}
      </HeaderContainer>
      <div role="tabpanel">
        {isExpanded && <div className={bodyClass}>{children}</div>}
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default CollapseSection;
