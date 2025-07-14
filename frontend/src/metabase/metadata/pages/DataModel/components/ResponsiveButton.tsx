import {
  Button,
  type ButtonProps,
  Flex,
  Icon,
  type IconName,
  Tooltip,
} from "metabase/ui";

interface Props extends Omit<ButtonProps, "leftSection"> {
  icon: IconName;
  showLabel: boolean;
  showIconWithLabel?: boolean;
}

export const ResponsiveButton = ({
  children,
  icon,
  showLabel,
  showIconWithLabel = true,
  ...props
}: Props) => {
  return (
    <Tooltip disabled={showLabel} label={children}>
      <Button
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
          {showLabel ? children : <Icon name={icon} />}
        </Flex>
      </Button>
    </Tooltip>
  );
};
