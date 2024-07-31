import { t } from "ttag";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import type { IconName } from "metabase/ui";
import { Icon } from "metabase/ui";

import useStatusVisibility from "../../hooks/use-status-visibility";

import {
  StatusCardRoot,
  StatusCardIcon,
  StatusCardBody,
  StatusCardTitle,
  StatusCardDescription,
  StatusCardSpinner,
  StatusCardIconContainer,
  StatusRoot,
  StatusHeader,
  StatusTitle,
  StatusToggle,
  StatusBody,
} from "./StatusLarge.styled";

type Status = {
  title: string;
  items: StatusItem[];
};

type StatusItem = {
  id?: number;
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
        {status.items.map(item => (
          <StatusCard item={item} isActive={isActive} key={item.id} />
        ))}
      </StatusBody>
    </StatusRoot>
  );
};

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
    <StatusCardRoot key={id} hasBody={!!description}>
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
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StatusLarge;
