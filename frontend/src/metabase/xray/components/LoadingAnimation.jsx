import React from "react";
import Icon from "metabase/components/Icon";

const RotatingGear = ({ name, speed, size, delay }) => (
  <div
    style={{
      animation: `${name} ${speed}ms linear ${delay}ms infinite`,
    }}
  >
    <Icon name="gear" size={size} />
  </div>
);

RotatingGear.defaultProps = {
  name: "spin",
  delay: 0,
  speed: 5000,
};

const LoadingAnimation = () => (
  <div className="relative" style={{ width: 300, height: 180 }}>
    <div className="absolute" style={{ top: 20, left: 135 }}>
      <RotatingGear size={90} />
    </div>
    <div className="absolute" style={{ top: 60, left: 80 }}>
      <RotatingGear name="spin-reverse" size={60} speed={6000} />
    </div>
    <div className="absolute" style={{ top: 110, left: 125 }}>
      <RotatingGear speed={7000} size={45} />
    </div>
  </div>
);

export default LoadingAnimation;
