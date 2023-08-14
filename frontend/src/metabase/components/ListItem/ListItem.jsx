/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";
import { Link } from "react-router";

import Card from "metabase/components/Card";
import S from "metabase/components/List/List.css";
import Ellipsified from "metabase/core/components/Ellipsified";
import { Icon } from "metabase/core/components/Icon";

import { Root } from "./ListItem.styled";

const ListItem = ({ name, description, disabled, placeholder, url, icon }) => {
  const card = (
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
  );

  if (disabled) {
    return <Root>{card}</Root>;
  }

  return (
    <Root>
      <Link to={url}>{card}</Link>
    </Root>
  );
};

ListItem.propTypes = {
  name: PropTypes.string.isRequired,
  url: PropTypes.string,
  description: PropTypes.string,
  disabled: PropTypes.bool,
  placeholder: PropTypes.string,
  icon: PropTypes.string,
};

export default memo(ListItem);
