import { Icon, type IconProps } from "metabase/ui";

export const DragHandle = (props: Omit<IconProps, "name">) => {
  return (
    <Icon
      flex="0 0 auto"
      name="grabber"
      role="button"
      style={{ cursor: "grab" }}
      tabIndex={0}
      {...props}
    />
  );
};
