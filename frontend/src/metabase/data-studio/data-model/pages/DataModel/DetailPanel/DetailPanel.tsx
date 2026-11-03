import {
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
  useState,
} from "react";
import { ResizableBox, type ResizeCallbackData } from "react-resizable";
import { useWindowSize } from "react-use";
import { t } from "ttag";

import {
  ActionIcon,
  Flex,
  Group,
  Icon,
  Skeleton,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./DetailPanel.module.css";

const MIN_PANEL_WIDTH = 400;
const MAX_PANEL_WIDTH_RATIO = 0.75;

interface DetailPanelProps {
  ref?: Ref<HTMLDivElement>;
  /** Width when the panel mounts; dragging its left edge changes it */
  defaultWidth: number;
  /** Called with the new width when a resize drag ends */
  onWidthChange?: (width: number) => void;
  children: ReactNode;
  "data-testid"?: string;
}

/**
 * A drawer panel styled like the Monitor detail sidebars: a white, padded,
 * scrollable column, resizable from its left edge.
 */
export function DetailPanel({
  ref,
  defaultWidth,
  onWidthChange,
  children,
  "data-testid": dataTestId,
}: DetailPanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const { width: windowWidth } = useWindowSize();
  const maxWidth = Math.max(
    MIN_PANEL_WIDTH,
    windowWidth * MAX_PANEL_WIDTH_RATIO,
  );

  const handleResize = (_event: SyntheticEvent, data: ResizeCallbackData) => {
    setWidth(data.size.width);
  };

  const handleResizeStart = () => {
    document.body.classList.add(S.noSelect);
  };

  const handleResizeStop = (
    _event: SyntheticEvent,
    data: ResizeCallbackData,
  ) => {
    document.body.classList.remove(S.noSelect);
    onWidthChange?.(data.size.width);
  };

  return (
    <ResizableBox
      className={S.resizable}
      width={width}
      minConstraints={[MIN_PANEL_WIDTH, 0]}
      maxConstraints={[maxWidth, 0]}
      axis="x"
      resizeHandles={["w"]}
      handle={<PanelEdgeHandle />}
      onResizeStart={handleResizeStart}
      onResize={handleResize}
      onResizeStop={handleResizeStop}
    >
      <Flex
        ref={ref}
        className={S.panel}
        direction="column"
        h="100%"
        w="100%"
        bg="background_page-primary"
        data-testid={dataTestId}
      >
        <Stack className={S.scroll} h="100%" p="xl" gap="xl">
          {children}
        </Stack>
      </Flex>
    </ResizableBox>
  );
}

type PanelEdgeHandleProps = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>;
  /** Injected by react-resizable; kept off the DOM element */
  handleAxis?: string;
};

/** Invisible grab area on the panel's left edge that darkens the border on hover. */
function PanelEdgeHandle({
  ref,
  handleAxis: _handleAxis,
  ...props
}: PanelEdgeHandleProps) {
  return <div ref={ref} className={S.resizeHandle} {...props} />;
}

const AVATAR_SIZE = 36;

interface DetailPanelHeaderProps {
  icon: IconName;
  label: string;
  title: ReactNode;
  /** Replaces the title with a skeleton */
  isLoading?: boolean;
  /** Rendered to the left of the close button */
  actions?: ReactNode;
  onClose: () => void;
  "data-testid"?: string;
}

/**
 * Entity header for a `DetailPanel`, styled like the Monitor detail sidebars:
 * an icon avatar, a small label above the entity title, optional actions, and
 * a close button.
 */
export function DetailPanelHeader({
  icon,
  label,
  title,
  isLoading,
  actions,
  onClose,
  "data-testid": dataTestId,
}: DetailPanelHeaderProps) {
  return (
    <Flex
      justify="space-between"
      align="center"
      gap="md"
      data-testid={dataTestId}
    >
      <Flex align="center" gap="sm" miw={0}>
        <Flex
          className={S.avatar}
          align="center"
          justify="center"
          w={AVATAR_SIZE}
          h={AVATAR_SIZE}
          bdrs="50%"
          bg="background_surface-brand-subtle"
        >
          <Icon name={icon} c="core-brand" />
        </Flex>
        <Stack gap={0} miw={0}>
          <Text size="sm" c="text-secondary">
            {label}
          </Text>
          {isLoading ? (
            <Skeleton h={24} w={200} mt={2} />
          ) : (
            <Title order={3} c="text-primary" lineClamp={2}>
              {title}
            </Title>
          )}
        </Stack>
      </Flex>
      <Group gap="sm" wrap="nowrap">
        {actions}
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <Icon name="close" />
        </ActionIcon>
      </Group>
    </Flex>
  );
}
