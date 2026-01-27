import type { PropsWithChildren } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Link } from "metabase/common/components/Link";
import type { IconName } from "metabase/ui";
import { Icon } from "metabase/ui";

import useStatusVisibility from "../../hooks/use-status-visibility";

import {
  StatusBody,
  StatusCardBody,
  StatusCardDescription,
  StatusCardIcon,
  StatusCardIconContainer,
  StatusCardRoot,
  StatusCardSpinner,
  StatusCardTitle,
  StatusHeader,
  StatusRoot,
  StatusTitle,
  StatusToggle,
} from "./StatusLarge.styled";

type Status = {
  title: string;
  items: StatusItem[];
};

type StatusItem = {
  id?: number;
  href?: string;
  title: string | JSX.Element;
  icon: string;
  description?: string | JSX.Element;
  isInProgress: boolean;
  isCompleted: boolean;
  isAborted: boolean;
};

export interface StatusLargeProps {
  status: Status;
  isActive?: boolean;
  onCollapse?: () => void;
  onDismiss?: () => void;
}

const StatusLarge = ({
  status,
  isActive,
  onCollapse,
  onDismiss,
}: StatusLargeProps) => {
  return (
    <StatusRoot role="status">
      <StatusHeader>
        <StatusTitle>
          <Ellipsified>{status.title}</Ellipsified>
        </StatusTitle>
        {onCollapse && (
          <StatusToggle onClick={onCollapse} aria-label={t`Collapse`}>
            <Icon name="chevrondown" />
          </StatusToggle>
        )}
        {onDismiss && (
          <StatusToggle onClick={onDismiss} aria-label={t`Dismiss`}>
            <Icon name="close" />
          </StatusToggle>
        )}
      </StatusHeader>
      <StatusBody>
        {status.items.map((item) => (
          <StatusCard
            item={item}
            isActive={isActive}
            key={item.id ?? String(item.title)}
          />
        ))}
      </StatusBody>
    </StatusRoot>
  );
};

const LinkWrapper = ({
  children,
  item,
}: PropsWithChildren<{ item: StatusItem }>) =>
  item?.href ? <Link to={item.href}>{children}</Link> : children;

interface StatusCardProps {
  item: StatusItem;
  isActive?: boolean;
}

const StatusCard = ({
  item,
  isActive,
}: StatusCardProps): JSX.Element | null => {
  const { id, title, icon, description, isInProgress, isCompleted, isAborted } =
    item;

  const isVisible = useStatusVisibility(isActive || isInProgress);

  if (!isVisible) {
    return null;
  }

  return (
    <LinkWrapper item={item} key={id}>
      <StatusCardRoot hasBody={!!description}>
        <StatusCardIcon>
          <Icon name={icon as unknown as IconName} />
        </StatusCardIcon>
        <StatusCardBody>
          <StatusCardTitle>
            <Ellipsified>{title}</Ellipsified>
          </StatusCardTitle>
          <StatusCardDescription>{description}</StatusCardDescription>
        </StatusCardBody>
        {isInProgress && <StatusCardSpinner size={24} borderWidth={3} />}
        {isCompleted && (
          <StatusCardIconContainer>
            <Icon name="check" size={12} />
          </StatusCardIconContainer>
        )}
        {isAborted && (
          <StatusCardIconContainer isError={true}>
            <Icon name="warning" size={12} />
          </StatusCardIconContainer>
        )}
      </StatusCardRoot>
    </LinkWrapper>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StatusLarge;
