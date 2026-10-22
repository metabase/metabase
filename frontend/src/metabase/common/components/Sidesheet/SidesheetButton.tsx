import { Button, type ButtonProps, Icon } from "metabase/ui";

export const SidesheetButton = (props: ButtonProps) => (
  <Button variant="transparent" size="compact-md" {...props} />
);

export const SidesheetButtonWithChevron = ({
  children,
  ...props
}: ButtonProps) => (
  <SidesheetButton
    justify="space-between"
    rightSection={<Icon name="chevronright" />}
    {...props}
  >
    {children}
  </SidesheetButton>
);
