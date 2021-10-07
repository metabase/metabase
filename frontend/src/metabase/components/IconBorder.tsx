/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes, { InferProps } from "prop-types";
import cx from "classnames";

/*
   Creates a bordered container for an <Icon /> component
   based on the <Icon /> component's size.

   usage:
   <IconBorder {...props} >
   <Icon name={chevrondown} size={12} />
   </IconBorder>
 */

const propTypes = {
  className: PropTypes.string,
  borderWidth: PropTypes.string,
  borderStyle: PropTypes.string,
  borderColor: PropTypes.string,
  borderRadius: PropTypes.string,
  style: PropTypes.object,
  children: PropTypes.any.isRequired,
};

const IconBorder: React.FC<InferProps<typeof propTypes>> = ({
  borderWidth = "1px",
  borderStyle = "solid",
  borderColor = "currentcolor",
  borderRadius = "99px",
  className,
  style = {},
  children,
}) => {
  const size = parseInt(children.props.size || children.props.width, 10) * 2;
  const styles = {
    width: size,
    height: size,
    borderWidth: borderWidth,
    borderStyle: borderStyle,
    borderColor: borderColor,
    borderRadius: borderRadius,
    ...style,
  };

  return (
    <div className={cx("flex layout-centered", className)} style={styles}>
      {children}
    </div>
  );
}
