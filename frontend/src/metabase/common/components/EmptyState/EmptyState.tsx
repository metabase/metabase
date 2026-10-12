import cx from "classnames";

import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import type { ButtonProps } from "metabase/ui";
import {
  Box,
  Button,
  Flex,
  Icon,
  Text,
  Title,
  isValidIconName,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./EmptyState.module.css";

/**
 * A raster illustration and its high-density variant, both resolved by the bundler.
 */
export type ImageSource = {
  src: string;
  srcSet?: string;
};

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
  image: ImageSource;
  imageHeight?: number;
  imageClassName?: string;
  message?: string;
}) => (
  <img
    src={image.src}
    width="300px"
    height={imageHeight}
    alt={message}
    srcSet={image.srcSet}
    className={imageClassName}
  />
);

type EmptyStateProps = {
  message?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
  link?: string;
  illustrationElement?: React.ReactNode;
  onActionClick?: () => void;
  className?: string;
  icon?: IconName;
  image?: ImageSource;
  spacing?: "sm" | "md";
  actionVariant?: ButtonProps["variant"];
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
  actionVariant = "filled",
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
        <Title order={2} role="status" aria-live="polite" c="text-secondary">
          {title}
        </Title>
      )}
      {message && (
        <Text role="status" c="text-secondary" lh="1.25rem" mt="xxs">
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
            <Button variant={actionVariant}>{action}</Button>
          </Link>
        )}
        {action && onActionClick && (
          <Button onClick={onActionClick} variant={actionVariant}>
            {action}
          </Button>
        )}
      </Flex>
    </Flex>
  </div>
);
