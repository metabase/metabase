import { Icon, type IconProps } from "metabase/ui";

interface Props extends Omit<IconProps, "name"> {
  size?: "md" | "lg";
}

export const DragHandle = ({ size = "md", ...props }: Props) => {
  return (
    <Icon
      flex="0 0 auto"
      name="grabber"
      role="button"
      style={{ cursor: "grab" }}
      tabIndex={0}
      size={size === "lg" ? 20 : 16}
      {...props}
    />
  );
};
