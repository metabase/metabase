/* eslint-disable react/prop-types */
import { Icon } from "metabase/ui";

const DisclosureTriangle = ({ open, className }) => (
  <Icon
    className={className}
    name="expand_arrow"
    style={{
      transition: "transform 300ms ease-out",
      transform: `rotate(${open ? 0 : -90}deg)`,
    }}
  />
);

export default DisclosureTriangle;
