import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import L from "metabase/components/List/List.module.css";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { Icon } from "metabase/ui";

import S from "./ReferenceHeader.module.css";

const ReferenceHeader = ({
  name,
  type,
  headerIcon,
  headerBody,
  headerLink,
}) => (
  <div className="wrapper">
    <div className={cx("relative", L.header)}>
      {headerIcon && (
        <div className="flex align-center mr2">
          <Icon className="text-light" name={headerIcon} size={21} />
        </div>
      )}
      <div className={S.headerBody}>
        <Ellipsified
          key="1"
          className={!headerLink && "flex-full"}
          tooltipMaxWidth="100%"
        >
          {name}
        </Ellipsified>

        {headerLink && (
          /* TODO: there is only L.headerButton, so either change to
          L.headerButton or remove */
          <div key="2" className={cx("flex-full", S.headerButton)}>
            <Link
              to={headerLink}
              className={cx("Button", "Button--borderless", "ml3")}
            >
              <div className="flex align-center relative">
                <span className="mr1 flex-no-shrink">{t`See this ${type}`}</span>
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
