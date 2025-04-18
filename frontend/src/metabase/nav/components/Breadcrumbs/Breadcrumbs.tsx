import { Link } from "react-router";

import { Icon, type IconName } from "metabase/ui";

interface BreadcrumbsProps {
  items: Array<{
    name?: string;
    href?: string;
    icon?: IconName;
  }>;
  className?: string;
  itemClassName?: string;
  itemSeparator?: React.ReactNode;
}

export function Breadcrumbs({
  items,
  className,
  itemClassName,
  itemSeparator = <Icon name="chevronright" size={8} />,
}: BreadcrumbsProps) {
  return (
    <div className={className}>
      {items.map((item, index) => (
        <div key={index} className={itemClassName}>
          {index > 0 && itemSeparator}
          {item.href ? (
            <Link to={item.href} className="link">
              {item.icon && <Icon name={item.icon} className="mr1" />}
              {item.name}
            </Link>
          ) : (
            <span>
              {item.icon && <Icon name={item.icon} className="mr1" />}
              {item.name}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
