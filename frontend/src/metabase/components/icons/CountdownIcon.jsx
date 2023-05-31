/* eslint-disable react/prop-types */
import { IconRoot } from "./CountdownIcon.styled";

const CountdownIcon = ({
  percent = 0.75,
  width = 20,
  height = 20,
  className,
}) => (
  <IconRoot
    width={width}
    height={height}
    className={className}
    viewBox="0 0 32 32"
    style={{
      transform: "rotate(-" + (percent * 360 + 90) + "deg)",
      borderRadius: "50%",
    }}
  >
    <circle
      r="16"
      cx="16"
      cy="16"
      fill="currentColor"
      stroke="currentColor"
      fillOpacity="0.5"
      strokeWidth="32"
      strokeDasharray={percent * 100 + " 100"}
    />
  </IconRoot>
);

export default CountdownIcon;
