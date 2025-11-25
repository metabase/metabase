import { useElementSize } from "@mantine/hooks";
import { useLayoutEffect } from "react";
import _ from "underscore";

import {
  Button,
  type ButtonProps,
  Flex,
  Icon,
  type IconName,
  Tooltip,
} from "metabase/ui";

interface Props extends Omit<ButtonProps, "leftSection"> {
  children: string;
  icon: IconName;
  showLabel: boolean;
  showIconWithLabel?: boolean;
  onRequestWidth?: (width: number) => void;
}

export const ResponsiveButton = ({
  children,
  icon,
  showLabel,
  showIconWithLabel = true,
  onRequestWidth = _.noop,
  ...props
}: Props) => {
  const { ref: measureRef, width: desiredWidth } = useElementSize();

  useLayoutEffect(() => {
    if (desiredWidth > 0) {
      onRequestWidth(desiredWidth);
    }
  }, [onRequestWidth, desiredWidth]);

  return (
    <>
      <Tooltip disabled={showLabel} label={children}>
        <Button
          aria-label={children}
          h={32}
          leftSection={
            showLabel && showIconWithLabel ? <Icon name={icon} /> : undefined
          }
          px={showLabel ? (showIconWithLabel ? "sm" : "md") : "xs"}
          py="xs"
          size="xs"
          w={showLabel ? undefined : 32}
          {...props}
        >
          <Flex align="center" justify="center" h="100%" w="100%">
            {showLabel ? children : <Icon name={icon} size={16} />}
          </Flex>
        </Button>
      </Tooltip>

      {/** rendered only to measure desired width */}
      <span
        style={{
          position: "absolute",
          visibility: "hidden",
          height: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        <Button
          disabled
          h={32}
          hidden
          leftSection={showIconWithLabel ? <Icon name={icon} /> : undefined}
          px={showIconWithLabel ? "sm" : "md"}
          py="xs"
          ref={measureRef}
          size="xs"
          {...props}
        >
          <Flex align="center" justify="center" h="100%" w="100%">
            {children}
          </Flex>
        </Button>
      </span>
    </>
  );
};
