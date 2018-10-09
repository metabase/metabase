import React from "react";

const ClockIcon = ({
  hour = 12,
  minute = 40,
  width = 20,
  height = 20,
  className,
}) => (
  <svg
    width={width}
    height={height}
    className={className}
    viewBox="0 0 20 20"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="10" cy="10" r="10" fill="currentColor" />
    <line
      x1="10"
      y1="10"
      x2="10"
      y2="5"
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      transform={`rotate(${(hour % 12) / 12 * 360} 10 10)`}
    />
    <line
      x1="10"
      y1="10"
      x2="10"
      y2="6"
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      transform={`rotate(${(minute % 60) / 60 * 360} 10 10)`}
    />
  </svg>
);

export default ClockIcon;
