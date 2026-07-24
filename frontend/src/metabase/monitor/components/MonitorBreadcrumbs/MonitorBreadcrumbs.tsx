import { Fragment, type MouseEventHandler, type ReactNode } from "react";
import { t } from "ttag";

import type { Crumb } from "metabase/common/components/Breadcrumbs";
import { Link } from "metabase/router";
import { Anchor, Ellipsified, Group, Icon } from "metabase/ui";

type CrumbTuple =
  | [title: ReactNode]
  | [
      title: ReactNode,
      urlOrAction: string | MouseEventHandler<HTMLSpanElement>,
    ];

type MonitorBreadcrumbsProps = {
  crumbs: Crumb[];
};

export function MonitorBreadcrumbs({ crumbs }: MonitorBreadcrumbsProps) {
  const normalized = crumbs.map(
    (crumb): CrumbTuple => (Array.isArray(crumb) ? crumb : [crumb]),
  );

  return (
    <Group
      component="nav"
      aria-label={t`Breadcrumbs`}
      gap="sm"
      wrap="nowrap"
      miw={0}
      data-testid="breadcrumbs"
    >
      {normalized.map((crumb, index) => {
        const isCurrent = index === normalized.length - 1;
        return (
          <Fragment key={index}>
            <MonitorBreadcrumb crumb={crumb} isCurrent={isCurrent} />
            {!isCurrent && (
              <Icon
                name="chevronright"
                c="text-secondary"
                size={12}
                aria-hidden
                aria-label={undefined}
                focusable={false}
              />
            )}
          </Fragment>
        );
      })}
    </Group>
  );
}

function MonitorBreadcrumb({
  crumb,
  isCurrent,
}: {
  crumb: CrumbTuple;
  isCurrent: boolean;
}) {
  const [title, urlOrAction] = crumb;
  const url = typeof urlOrAction === "string" ? urlOrAction : undefined;
  const onClick = typeof urlOrAction === "function" ? urlOrAction : undefined;

  if (url) {
    return (
      <Anchor
        component={Link}
        to={url}
        fz="sm"
        fw="normal"
        c="text-secondary"
        underline="never"
        miw={0}
      >
        <Ellipsified tooltip={title}>{title}</Ellipsified>
      </Anchor>
    );
  }

  if (onClick) {
    return (
      <Anchor
        component="button"
        type="button"
        onClick={onClick}
        fz="sm"
        fw="normal"
        c="text-secondary"
        underline="never"
        miw={0}
      >
        <Ellipsified tooltip={title}>{title}</Ellipsified>
      </Anchor>
    );
  }

  return (
    <Ellipsified
      fz="sm"
      fw="normal"
      c={isCurrent ? "text-primary" : "text-secondary"}
      tooltip={title}
      aria-current={isCurrent ? "page" : undefined}
    >
      {title}
    </Ellipsified>
  );
}
