import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import cx from "classnames";
import pure from "recompose/pure";

import S from "./ReferenceHeader.css";
import L from "metabase/components/List.css";
import E from "metabase/reference/components/EditButton.css";

import IconBorder from "metabase/components/IconBorder.jsx";
import Icon from "metabase/components/Icon.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import { t } from "c-3po";
import colors from "metabase/lib/colors";

const ReferenceHeader = ({
  name,
  type,
  headerIcon,
  headerBody,
  headerLink,
}) => (
  <div className="wrapper wrapper--trim">
    <div className={cx("relative", L.header)}>
      <div className={L.leftIcons}>
        {headerIcon && (
          <IconBorder
            borderWidth="0"
            style={{ backgroundColor: colors["bg-medium"] }}
          >
            <Icon
              className="text-brand"
              name={headerIcon}
              width={24}
              height={24}
            />
          </IconBorder>
        )}
      </div>
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
              className={cx(
                "Button",
                "Button--borderless",
                "ml3",
                E.editButton,
              )}
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
