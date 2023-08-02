/* eslint "react/prop-types": "warn" */
import { memo } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import Card from "metabase/components/Card";
import S from "metabase/components/List/List.css";
import { Icon } from "metabase/core/components/Icon";
import { ListItemLink, ListItemName } from "./ListItem.styled";

const ListItem = ({ name, description, placeholder, url, icon }) => (
  <li className="relative">
    <ListItemLink to={url}>
      <Card hoverable className="mb2 p3 bg-white rounded bordered">
        <div className={cx(S.item)}>
          <div className={S.itemIcons}>
            {icon && <Icon className={S.chartIcon} name={icon} size={16} />}
          </div>
          <div className={S.itemBody}>
            <div className={S.itemTitle}>
              <ListItemName tooltip={name} tooltipMaxWidth="100%">
                <h3>{name}</h3>
              </ListItemName>
            </div>
            {(description || placeholder) && (
              <div className={cx(S.itemSubtitle)}>
                {description || placeholder}
              </div>
            )}
          </div>
        </div>
      </Card>
    </ListItemLink>
  </li>
);

ListItem.propTypes = {
  name: PropTypes.string.isRequired,
  url: PropTypes.string,
  description: PropTypes.string,
  placeholder: PropTypes.string,
  icon: PropTypes.string,
};

export default memo(ListItem);
