import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import L from "metabase/components/List/List.module.css";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import S from "./ReferenceHeader.module.css";

const ReferenceHeader = ({
  name,
  type,
  headerIcon,
  headerBody,
  headerLink,
}) => (
  <div className={CS.wrapper}>
    <div className={cx(CS.relative, L.header)}>
      {headerIcon && (
        <div className={cx(CS.flex, CS.alignCenter, CS.mr2)}>
          <Icon className={CS.textLight} name={headerIcon} size={21} />
        </div>
      )}
      <div className={S.headerBody}>
        <Ellipsified
          key="1"
          className={!headerLink && CS.flexFull}
          tooltipMaxWidth="auto"
        >
          {name}
        </Ellipsified>

        {headerLink && (
          <div key="2" className={cx(CS.flexFull)}>
            <Link
              to={headerLink}
              className={cx(ButtonsS.Button, ButtonsS.ButtonBorderless, CS.ml3)}
            >
              <div className={cx(CS.flex, CS.alignCenter, CS.relative)}>
                <span
                  className={cx(CS.mr1, CS.flexNoShrink)}
                >{t`See this ${type}`}</span>
                <Icon name="chevronright" size={16} />
              </div>
            </Link>
          </div>
        )}
      </div>
    </div>
  </div>
);

ReferenceHeader.propTypes = {
  name: PropTypes.string.isRequired,
  type: PropTypes.string,
  headerIcon: PropTypes.string,
  headerBody: PropTypes.string,
  headerLink: PropTypes.string,
};

export default memo(ReferenceHeader);
