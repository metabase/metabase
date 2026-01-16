import cx from "classnames";
import { Link } from "react-router";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Anchor, Breadcrumbs, Group, Icon } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeLocationInfo } from "../../../../utils";

import S from "./SidebarLocationInfo.module.css";

type SidebarLocationInfoProps = {
  node: DependencyNode;
};

export function SidebarLocationInfo({ node }: SidebarLocationInfoProps) {
  const title = t`Location`;
  const locationInfo = getNodeLocationInfo(node);

  if (locationInfo == null) {
    return null;
  }

  return (
    <Breadcrumbs lh="h5" aria-label={title}>
      {locationInfo.links.map((link, linkIndex) => (
        <Anchor
          key={linkIndex}
          component={Link}
          className={cx(CS.textWrap, S.link)}
          lh="h5"
          to={link.url}
          target="_blank"
        >
          <Group gap="sm" wrap="nowrap">
            {linkIndex === 0 && <Icon name={locationInfo.icon} />}
            {link.label}
          </Group>
        </Anchor>
      ))}
    </Breadcrumbs>
  );
}
