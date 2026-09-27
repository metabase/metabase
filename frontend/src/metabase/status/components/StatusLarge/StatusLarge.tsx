import type { PropsWithChildren } from "react";
import { t } from "ttag";

import { IconButtonWrapper } from "metabase/common/components/IconButtonWrapper";
import { Link } from "metabase/common/components/Link";
import { Box, Ellipsified, Flex, Icon, Loader, rem } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import useStatusVisibility from "../../hooks/use-status-visibility";

import S from "./StatusLarge.module.css";

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
    <Box
      className={S.root}
      role="status"
      w={rem(256)}
      mt="lg"
      bg="background_page-primary"
    >
      <Flex align="center" py={rem(10)} px="lg" bg="core-brand">
        <Box
          flex="1 1 auto"
          w="100%"
          c="background_page-secondary"
          fz="md"
          fw="bold"
          lh={rem(16)}
        >
          <Ellipsified>{status.title}</Ellipsified>
        </Box>
        {onCollapse && (
          <IconButtonWrapper
            className={S.toggle}
            onClick={onCollapse}
            aria-label={t`Collapse`}
          >
            <Icon name="chevrondown" />
          </IconButtonWrapper>
        )}
        {onDismiss && (
          <IconButtonWrapper
            className={S.toggle}
            onClick={onDismiss}
            aria-label={t`Dismiss`}
          >
            <Icon name="close" />
          </IconButtonWrapper>
        )}
      </Flex>
      <Box bg="background_page-primary">
        {status.items.map((item) => (
          <StatusCard
            item={item}
            isActive={isActive}
            key={item.id ?? String(item.title)}
          />
        ))}
      </Box>
    </Box>
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
      <Flex align={description ? "flex-start" : "center"} m="md">
        <Flex
          className={S.round}
          flex="0 0 auto"
          align="center"
          justify="center"
          w={rem(32)}
          h={rem(32)}
          c="core-brand"
          bg="background_surface-brand-subtle"
        >
          {/* Unjustified type cast. FIXME */}
          <Icon name={icon as unknown as IconName} />
        </Flex>
        <Box className={S.clipped} flex="1 1 auto" mx="md">
          <Box
            className={S.clipped}
            c="text-primary"
            fz="md"
            fw="bold"
            lh={rem(16)}
          >
            <Ellipsified>{title}</Ellipsified>
          </Box>
          <Box
            c="background_page-tertiary-inverse"
            fz="xs"
            fw="bold"
            lh={rem(13)}
            mt="xxs"
          >
            {description}
          </Box>
        </Box>
        {isInProgress && <Loader size="md" color="core-brand" />}
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
      </Flex>
    </LinkWrapper>
  );
};

interface StatusCardIconContainerProps {
  isError?: boolean;
}

const StatusCardIconContainer = ({
  isError,
  children,
}: PropsWithChildren<StatusCardIconContainerProps>) => (
  <Flex
    className={S.round}
    flex="0 0 auto"
    align="center"
    justify="center"
    w={rem(24)}
    h={rem(24)}
    c="text-primary-inverse"
    bg={isError ? "feedback-negative" : "feedback-positive"}
  >
    {children}
  </Flex>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StatusLarge;
