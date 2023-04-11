import React from "react";
import Ellipsified from "metabase/core/components/Ellipsified";
import Icon from "../../../components/Icon";
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

type status = {
  title: string;
  items: statusItem[];
};

type statusItem = {
  id?: number;
  title: string;
  icon: string;
  description?: string;
  isInProgress: boolean;
  isCompleted: boolean;
  isAborted: boolean;
};

export interface StatusLargeProps {
  status: status;
  isActive?: boolean;
  onCollapse?: () => void;
}

const StatusLarge = ({
  status,
  isActive = true,
  onCollapse,
}: StatusLargeProps): JSX.Element => {
  return (
    <StatusRoot role="status">
      <StatusHeader>
        <StatusTitle>{status.title}</StatusTitle>
        <StatusToggle onClick={onCollapse}>
          <Icon name="chevrondown" />
        </StatusToggle>
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
  item: statusItem;
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
    <StatusCardRoot key={id}>
      <StatusCardIcon>
        <Icon name={icon} />
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

export default StatusLarge;
