import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import type { ColorName } from "metabase/ui/colors/types";
import type { IconName } from "metabase-types/api";

import type { QueryColumnInfoPopoverProps } from "../ColumnInfoPopover";
import { QueryColumnInfoPopover } from "../ColumnInfoPopover";
import {
  HoverParent,
  PopoverDefaultIcon,
  PopoverHoverTarget,
} from "../InfoIcon";

export { HoverParent };

type QueryColumnInfoIconProps = QueryColumnInfoPopoverProps & {
  size?: number;
  icon?: IconName;
  color?: ColorName;
};

export function QueryColumnInfoIcon({
  className,
  size,
  icon,
  color,
  ...props
}: QueryColumnInfoIconProps) {
  const { column } = props;

  return (
    <>
      <QueryColumnInfoPopover {...props}>
        <span aria-label={t`More info`}>
          <PopoverDefaultIcon
            className={className}
            name={icon ?? getColumnIcon(column)}
            size={size}
            c={color}
          />
          <PopoverHoverTarget className={className} name="info" size={size} />
        </span>
      </QueryColumnInfoPopover>
    </>
  );
}

QueryColumnInfoIcon.HoverParent = HoverParent;
