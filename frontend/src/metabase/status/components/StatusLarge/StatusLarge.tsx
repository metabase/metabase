import Ellipsified from "metabase/core/components/Ellipsified";
import { Icon, IconName } from "metabase/core/components/Icon";
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
}

const StatusLarge = ({
  status,
  isActive,
  onCollapse,
}: StatusLargeProps): JSX.Element => {
  return (
    <StatusRoot role="status">
      <StatusHeader>
        <StatusTitle>{status.title}</StatusTitle>
        {onCollapse && (
          <StatusToggle onClick={onCollapse}>
            <Icon name="chevrondown" />
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
    <StatusCardRoot key={id}>
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
