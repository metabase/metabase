/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import S from "./List.css";
import Icon from "./Icon";
import Ellipsified from "./Ellipsified";

import cx from "classnames";
import pure from "recompose/pure";
import Card from "metabase/components/Card";

//TODO: extend this to support functionality required for questions
const ListItem = ({ index, name, description, placeholder, url, icon }) => (
  <Link to={url} className="text-brand-hover">
    <Card hoverable className="mb2 p3 bg-white rounded bordered">
      <div className={cx(S.item)}>
        <div className={S.itemIcons}>
          {icon && <Icon className={S.chartIcon} name={icon} size={16} />}
        </div>
        <div className={S.itemBody}>
          <div className={S.itemTitle}>
            <Ellipsified
              className={S.itemName}
              tooltip={name}
              tooltipMaxWidth="100%"
            >
              <h3>{name}</h3>
            </Ellipsified>
          </div>
          {(description || placeholder) && (
            <div className={cx(S.itemSubtitle)}>
              {description || placeholder}
            </div>
          )}
        </div>
      </div>
    </Card>
  </Link>
);

ListItem.propTypes = {
  name: PropTypes.string.isRequired,
  index: PropTypes.number.isRequired,
  url: PropTypes.string,
  description: PropTypes.string,
  placeholder: PropTypes.string,
  icon: PropTypes.string,
  isEditing: PropTypes.bool,
  field: PropTypes.object,
};

export default pure(ListItem);
