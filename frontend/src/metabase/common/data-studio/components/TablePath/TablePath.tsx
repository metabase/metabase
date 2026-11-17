import { Children, Fragment, type ReactNode, isValidElement } from "react";

import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { Group, Icon, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

type TablePathProps = {
  children: ReactNode;
};

export function TablePath({ children }: TablePathProps) {
  const items = Children.toArray(children);

  return (
    <Group gap="sm">
      {items.map((item, index) => (
        <Fragment key={isValidElement(item) ? item.key : index}>
          {index > 0 && <Icon name="chevronright" size={8} />}
          {item}
        </Fragment>
      ))}
    </Group>
  );
}

type TablePathItemProps = {
  label: string;
  icon: IconName;
  to?: string;
  tooltip?: string;
  "data-testid"?: string;
};

export function TablePathItem({
  label,
  icon,
  to,
  tooltip,
  "data-testid": dataTestId,
}: TablePathItemProps) {
  return (
    <Link
      className={CS.link}
      to={to ?? ""}
      disabled={to == null}
      data-testid={dataTestId}
      tooltip={tooltip}
    >
      <Group gap="xxs">
        <Icon name={icon} />
        <Text c="inherit">{label}</Text>
      </Group>
    </Link>
  );
}
