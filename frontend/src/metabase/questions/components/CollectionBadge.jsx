import React from "react";
import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";

import Color from "color";
import cx from "classnames";

const CollectionBadge = ({ className, collection }) => {
  const color = Color(collection.color);
  const darkened = color.darken(0.1);
  const lightened = color.lighten(0.4);
  return (
    <Link
      to={Urls.collection(collection)}
      className={cx(className, "flex align-center px1 rounded mx1")}
      style={{
        fontSize: 14,
        color: lightened.isDark() ? "#fff" : darkened,
        backgroundColor: lightened,
      }}
    >
      {collection.name}
    </Link>
  );
};

export default CollectionBadge;
