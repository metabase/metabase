import cx from "classnames";
import type { PropsWithChildren } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Box,
  Ellipsified,
  Flex,
  Icon,
  Loader,
  Paper,
  Text,
} from "metabase/ui";
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

export const StatusLarge = ({
  status,
  isActive,
  onCollapse,
  onDismiss,
}: StatusLargeProps) => {
  return (
    <Paper
      className={cx(S.shadow, CS.overflowHidden)}
      role="status"
      w="16rem"
      mt="lg"
      radius="xs"
      withBorder
    >
      <Flex
        align="center"
        gap="xs"
        py="0.375rem"
        pl="lg"
        pr="md"
        bg="core-brand"
      >
        <Box
          flex="1 1 auto"
          w="100%"
          c="background_page-secondary"
          fz="md"
          fw="bold"
          lh="1rem"
        >
          <Ellipsified>{status.title}</Ellipsified>
        </Box>
        {onCollapse && (
          <ActionIcon
            variant="on-dark-secondary"
            size="sm"
            onClick={onCollapse}
            aria-label={t`Collapse`}
          >
            <Icon name="chevrondown" />
          </ActionIcon>
        )}
        {onDismiss && (
          <ActionIcon
            variant="on-dark-secondary"
            size="sm"
            onClick={onDismiss}
            aria-label={t`Dismiss`}
          >
            <Icon name="close" />
          </ActionIcon>
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
    </Paper>
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
          flex="0 0 auto"
          align="center"
          justify="center"
          w="2rem"
          h="2rem"
          bdrs="lg"
          c="core-brand"
          bg="background_surface-brand-subtle"
        >
          {/* Unjustified type cast. FIXME */}
          <Icon name={icon as unknown as IconName} />
        </Flex>
        <Box flex="1 1 auto" mx="md">
          <Box
            className={CS.overflowHidden}
            c="text-primary"
            fz="md"
            fw="bold"
            lh="1rem"
          >
            <Ellipsified>{title}</Ellipsified>
          </Box>
          <Text
            size="xs"
            fw="bold"
            mt="xxs"
            c="background_page-tertiary-inverse"
          >
            {description}
          </Text>
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
    flex="0 0 auto"
    align="center"
    justify="center"
    w="1.5rem"
    h="1.5rem"
    bdrs="lg"
    c="text-primary-inverse"
    bg={isError ? "feedback-negative" : "feedback-positive"}
  >
    {children}
  </Flex>
);
