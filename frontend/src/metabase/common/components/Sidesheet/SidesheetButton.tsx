import { Button, type ButtonProps, Flex, Icon } from "metabase/ui";

export const SidesheetButton = (props: ButtonProps) => (
  <Button variant="subtle" p={0} {...props} />
);

export const SidesheetButtonWithChevron = ({
  children,
  ...props
}: ButtonProps) => (
  <SidesheetButton
    styles={props.fullWidth ? { label: { width: "100%" } } : undefined}
    {...props}
  >
    <Flex justify="space-between" gap="sm">
      {children}
      <Icon name="chevronright" c="text-primary" />
    </Flex>
  </SidesheetButton>
);
