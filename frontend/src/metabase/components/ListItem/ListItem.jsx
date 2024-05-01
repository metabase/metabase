/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";

import Card from "metabase/components/Card";
import S from "metabase/components/List/List.module.css";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import { ListItemLink, ListItemName, Root } from "./ListItem.styled";

const ListItem = ({
  "data-testid": dataTestId,
  name,
  url,
  description,
  disabled,
  placeholder,
  icon,
}) => {
  const card = (
    <Card
      hoverable
      className={cx(CS.mb2, CS.p3, CS.bgWhite, CS.rounded, CS.bordered)}
    >
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
  );

  if (disabled) {
    return (
      <Root data-testid={dataTestId} disabled>
        {card}
      </Root>
    );
  }

  return (
    <Root data-testid={dataTestId}>
      <ListItemLink to={url}>{card}</ListItemLink>
    </Root>
  );
};

ListItem.propTypes = {
  "data-testid": PropTypes.string,
  name: PropTypes.string.isRequired,
  url: PropTypes.string,
  description: PropTypes.string,
  disabled: PropTypes.bool,
  placeholder: PropTypes.string,
  icon: PropTypes.string,
};

export default memo(ListItem);
