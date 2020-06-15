import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import cx from "classnames";
import pure from "recompose/pure";

import S from "./ReferenceHeader.css";
import L from "metabase/components/List.css";

import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/components/Ellipsified";
import { t } from "ttag";

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
          <div key="2" className={cx("flex-full", S.headerButton)}>
            <Link
              to={headerLink}
              className={cx("Button", "Button--borderless", "ml3")}
              data-metabase-event={`Data Reference;Entity -> QB click;${type}`}
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

export default pure(ReferenceHeader);
