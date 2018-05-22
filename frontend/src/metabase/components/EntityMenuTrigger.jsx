import React from "react";
import Icon from "metabase/components/Icon";
import cxs from "cxs";

const EntityMenuTrigger = ({ icon, onClick, open }) => {
  const interactionColor = "#F2F4F5";
  const classes = cxs({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 99,
    cursor: "pointer",
    color: open ? "#509ee3" : "inherit",
    backgroundColor: open ? interactionColor : "transparent",
    ":hover": {
      backgroundColor: interactionColor,
      color: "#509ee3",
      transition: "all 300ms linear",
    },
    // special cases for certain icons
    // Icon-share has a taller viewvbox than most so to optically center
    // the icon we need to translate it upwards
    "> .Icon.Icon-share": {
      transform: `translateY(-2px)`,
    },
  });

  return (
    <div onClick={onClick} className={classes}>
      <Icon name={icon} className="m1" />
    </div>
  );
};

export default EntityMenuTrigger;
