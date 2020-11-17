import React from "react";

import Icon from "metabase/components/Icon";

const UseForButton = ({ title, onClick }) => (
  <a
    className="Button Button--white text-default text-brand-hover border-brand-hover no-decoration"
    onClick={onClick}
  >
    <Icon className="mr1" name="add" size={12} /> {title}
  </a>
);

export default UseForButton;
