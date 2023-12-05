import cx from "classnames";
import { Icon } from "metabase/core/components/Icon";
import type { IconName } from "metabase/core/components/Icon";
import { color as c, alpha } from "metabase/lib/colors";

export interface ViewPillProps {
  className?: string;
  color?: string;
  invert?: boolean;
  icon?: IconName;
  removeButtonLabel?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLSpanElement>;
  onRemove?: () => void;
}

function ViewPill({
  className,
  style = {},
  color = c("brand"),
  invert,
  children,
  removeButtonLabel,
  onClick,
  onRemove,
  icon,
  ...props
}: ViewPillProps) {
  return (
    <span
      {...props}
      className={cx("rounded flex align-center text-bold", className, {
        "cursor-pointer": onClick,
      })}
      style={{
        height: 22,
        paddingLeft: icon ? 5 : 8,
        paddingRight: children ? 8 : 5,
        ...(invert
          ? { backgroundColor: color, color: "white" }
          : { backgroundColor: alpha(color, 0.2), color: color }),
        ...style,
      }}
      onClick={onClick}
    >
      {icon && (
        <Icon name={icon} size={12} className={cx({ mr1: !!children })} />
      )}
      {children}
      {onRemove && (
        <Icon
          name="close"
          size={12}
          className="ml1"
          role="button"
          aria-label={removeButtonLabel}
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
        />
      )}
    </span>
  );
}

// eslint-disable-next-line import/no-default-export
export default ViewPill;
