import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import type { IconName } from "metabase/ui";
import { Icon, Text, isValidIconName } from "metabase/ui";

import {
  EmptyStateActions,
  EmptyStateFooter,
  EmptyStateHeader,
  EmptyStateIllustration,
} from "./EmptyState.styled";

// Don't break existing empty states
// TODO - remove these and update empty states with proper usage of illustrationElement
const LegacyIcon = ({ icon }: { icon: IconName }) =>
  icon ? <Icon name={icon} className={CS.textLight} size={40} /> : null;

const LegacyImage = ({
  image,
  imageHeight,
  imageClassName,
  message,
}: {
  image: string;
  imageHeight?: number;
  imageClassName?: string;
  message?: string;
}) =>
  image ? (
    <img
      src={`${image}.png`}
      width="300px"
      height={imageHeight}
      alt={message}
      srcSet={`${image}@2x.png 2x`}
      className={imageClassName}
    />
  ) : null;

type EmptyStateProps = {
  message?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
  link?: string;
  illustrationElement?: React.ReactNode;
  onActionClick?: () => void;
  className?: string;
  icon?: IconName;
  image?: string;
};

const EmptyState = ({
  title,
  message,
  action,
  link,
  illustrationElement,
  onActionClick,
  className,
  icon,
  image,
  ...rest
}: EmptyStateProps) => (
  <div className={className}>
    <EmptyStateHeader>
      {illustrationElement && (
        <EmptyStateIllustration className="empty-state-illustration">
          {illustrationElement}
        </EmptyStateIllustration>
      )}
      <div>
        {isValidIconName(icon) && <LegacyIcon icon={icon} {...rest} />}
        {image && <LegacyImage image={image} {...rest} />}
      </div>
      {title && (
        <h2 role="status" aria-live="polite" className={CS.textMedium}>
          {title}
        </h2>
      )}
      {message && (
        <Text role="status" color="medium" mt="xs">
          {message}
        </Text>
      )}
    </EmptyStateHeader>
    {/* TODO - we should make this children or some other more flexible way to
      add actions
      */}
    <EmptyStateFooter>
      <EmptyStateActions>
        {action && link && (
          <Link to={link} target={link.startsWith("http") ? "_blank" : ""}>
            <Button primary>{action}</Button>
          </Link>
        )}
        {action && onActionClick && (
          <Button onClick={onActionClick} primary>
            {action}
          </Button>
        )}
      </EmptyStateActions>
    </EmptyStateFooter>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EmptyState;
