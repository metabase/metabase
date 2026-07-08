import cx from "classnames";

import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { Box, Button, Flex, Icon, Text, isValidIconName } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./EmptyState.module.css";

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
  spacing?: "sm" | "md";
};

export const EmptyState = ({
  title,
  message,
  action,
  link,
  illustrationElement,
  onActionClick,
  className,
  icon,
  image,
  spacing = "md",
  ...rest
}: EmptyStateProps) => (
  <div className={className}>
    <Flex direction="column" align="center" justify="center" ta="center">
      {illustrationElement && (
        <Box
          className={cx("empty-state-illustration", S.illustration)}
          data-spacing={spacing}
        >
          {illustrationElement}
        </Box>
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
        <Text role="status" c="text-secondary" mt="xs">
          {message}
        </Text>
      )}
    </Flex>
    {/* TODO - we should make this children or some other more flexible way to
      add actions
      */}
    <Flex>
      <Flex className={S.footer} align="center" mx="auto">
        {action && link && (
          <Link to={link} target={link.startsWith("http") ? "_blank" : ""}>
            <Button variant="filled">{action}</Button>
          </Link>
        )}
        {action && onActionClick && (
          <Button onClick={onActionClick} variant="filled">
            {action}
          </Button>
        )}
      </Flex>
    </Flex>
  </div>
);
