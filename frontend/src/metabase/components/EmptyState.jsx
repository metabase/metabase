/* @flow */
import React from "react";
import { Link } from "react-router";
import cx from "classnames";
/*
 * EmptyState is a component that can
 *  1) introduce a new section of Metabase to a user and encourage the user to take an action
 *  2) indicate an empty result after a user-triggered search/query
 */

import Icon from "metabase/components/Icon.jsx";

type EmptyStateProps = {
  message: string | React$Element<any>,
  title?: string,
  icon?: string,
  image?: string,
  imageHeight?: string, // for reducing ui flickering when the image is loading
  imageClassName?: string,
  action?: string,
  link?: string,
  onActionClick?: () => void,
  smallDescription?: boolean,
};

const EmptyState = ({
  title,
  message,
  icon,
  image,
  imageHeight,
  imageClassName,
  action,
  link,
  onActionClick,
  smallDescription = false,
}: EmptyStateProps) => (
  <div
    className="text-centered text-brand-light my2"
    style={smallDescription ? {} : { width: "350px" }}
  >
    {title && <h2 className="text-brand mb4">{title}</h2>}
    {icon && <Icon name={icon} size={40} />}
    {image && (
      <img
        src={`${image}.png`}
        width="300px"
        height={imageHeight}
        alt={message}
        srcSet={`${image}@2x.png 2x`}
        className={imageClassName}
      />
    )}
    <div className="flex justify-center">
      <h2
        className={cx("text-light text-normal mt2 mb4", {
          "text-paragraph": smallDescription,
        })}
        style={{ lineHeight: "1.5em" }}
      >
        {message}
      </h2>
    </div>
    {action &&
      link && (
        <Link
          to={link}
          className="Button Button--primary mt4"
          target={link.startsWith("http") ? "_blank" : ""}
        >
          {action}
        </Link>
      )}
    {action &&
      onActionClick && (
        <a onClick={onActionClick} className="Button Button--primary mt4">
          {action}
        </a>
      )}
  </div>
);

export default EmptyState;
