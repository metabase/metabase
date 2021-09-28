/* eslint-disable react/prop-types */
import React from "react";
// import cx from "classnames";
// import { Motion, spring } from "react-motion";

import { ViewSideBarAside, ViewSidebarContent } from "./ViewSidebar.styled";

// const SPRING_CONFIG = { stiffness: 200, damping: 26 };

const ViewSideBar = ({ left, right, width = 355, isOpen, children }) => (
  <ViewSideBarAside left={left} right={right} width={width} isOpen={isOpen}>
    <ViewSidebarContent>{children}</ViewSidebarContent>
  </ViewSideBarAside>
);

export default ViewSideBar;

// <Motion
//   defaultStyle={{ opacity: 0, width: 0 }}
//   style={
//     isOpen
//       ? { opacity: spring(1), width: spring(width, SPRING_CONFIG) }
//       : { opacity: spring(0), width: spring(0, SPRING_CONFIG) }
//   }
// >
// {motionStyle => (
// <aside
//   data-testid={right ? "sidebar-right" : "sidebar-left"}
//   className={cx("scroll-y bg-white relative overflow-x-hidden", {
//     "border-right": left,
//     "border-left": right,
//   })}
//   style={motionStyle}
// >
