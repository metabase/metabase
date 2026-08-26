import cx from "classnames";
import { memo } from "react";

import CS from "metabase/css/core/index.css";
import L from "metabase/reference/components/List/List.module.css";
import { Ellipsified, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./ReferenceHeader.module.css";

interface ReferenceHeaderProps {
  name: string;
  headerIcon?: IconName;
}

const ReferenceHeader = ({ name, headerIcon }: ReferenceHeaderProps) => (
  <div className={CS.wrapper}>
    <div className={cx(CS.relative, L.header)}>
      {headerIcon && (
        <div className={cx(CS.flex, CS.alignCenter, CS.mr2)}>
          <Icon className={CS.textLight} name={headerIcon} size={21} />
        </div>
      )}
      <div className={S.headerBody}>
        <Ellipsified className={CS.flexFull} tooltipProps={{ w: "auto" }}>
          {name}
        </Ellipsified>
      </div>
    </div>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(ReferenceHeader);
