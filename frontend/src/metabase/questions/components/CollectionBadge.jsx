import React from "react";
import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";

import Color from "color";
import cx from "classnames";

const CollectionBadge = ({ className, collection }) =>
    <Link
        to={Urls.collection(collection)}
        className={cx(className, "flex align-center px1 rounded mx1")}
        style={{
            fontSize: 14,
            color: Color(collection.color).darken(0.1).hex(),
            backgroundColor: Color(collection.color).lighten(0.4).hex()
        }}
    >
        {collection.name}
    </Link>

export default CollectionBadge;
