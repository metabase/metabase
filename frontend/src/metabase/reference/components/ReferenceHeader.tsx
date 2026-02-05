import cx from "classnames";
import { memo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import L from "metabase/common/components/List/List.module.css";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import type { IconName } from "metabase/ui";
import { Icon } from "metabase/ui";

import S from "./ReferenceHeader.module.css";

interface ReferenceHeaderProps {
  name: string;
  type?: string;
  headerIcon?: IconName;
  headerLink?: string;
}

const ReferenceHeader = ({
  name,
  type,
  headerIcon,
  headerLink,
}: ReferenceHeaderProps) => (
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
          className={!headerLink ? CS.flexFull : undefined}
          tooltipProps={{ w: "auto" }}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(ReferenceHeader);
