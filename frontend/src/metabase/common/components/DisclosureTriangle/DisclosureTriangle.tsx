import { Icon } from "metabase/ui";

interface DisclosureTriangleProps {
  open: boolean;
  className?: string;
}

export const DisclosureTriangle = ({
  open,
  className,
}: DisclosureTriangleProps) => (
  <Icon
    className={className}
    name="expand_arrow"
    style={{
      transition: "transform 300ms ease-out",
      transform: `rotate(${open ? 0 : -90}deg)`,
    }}
  />
);
