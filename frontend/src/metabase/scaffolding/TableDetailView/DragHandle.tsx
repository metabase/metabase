import { Icon, type IconProps } from "metabase/ui";

export const DragHandle = (props: Omit<IconProps, "name">) => {
  return (
    <Icon
      name="grabber"
      role="button"
      style={{ cursor: "grab" }}
      tabIndex={0}
      {...props}
    />
  );
};
