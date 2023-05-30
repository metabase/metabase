/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import cx from "classnames";
import Ellipsified from "metabase/core/components/Ellipsified";
import Card from "metabase/components/Card";
import S from "metabase/components/List/List.css";
import { Icon } from "metabase/core/components/Icon";

const ListItem = ({ name, description, placeholder, url, icon }) => (
  <li className="relative">
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
  </li>
);

ListItem.propTypes = {
  name: PropTypes.string.isRequired,
  url: PropTypes.string,
  description: PropTypes.string,
  placeholder: PropTypes.string,
  icon: PropTypes.string,
};

export default React.memo(ListItem);
