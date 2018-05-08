import React from "react";
import { Link } from "react-router";
import Icon from "metabase/components/Icon";

const ItemLink = ({ link, item, dropdown }) => (
  <Link
    to={link}
    className="no-decoration flex align-center bordered shadowed bg-white p1 px2 rounded mr1"
  >
    <div
      style={{
        width: 12,
        height: 12,
        backgroundColor: item.color.main,
        borderRadius: 99,
        display: "block",
      }}
    />
    <h2 className="ml1">
      {item.name}
      {dropdown && <Icon name="chevrondown" size={12} className="ml1" />}
    </h2>
  </Link>
);

export default ItemLink;
