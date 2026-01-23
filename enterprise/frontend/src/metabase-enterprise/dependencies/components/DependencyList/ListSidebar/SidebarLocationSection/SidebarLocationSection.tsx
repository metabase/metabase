import cx from "classnames";
import { Link } from "react-router";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Anchor, Breadcrumbs, FixedSizeIcon, Group } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeLocationInfo } from "../../../../utils";
import S from "../ListSidebar.module.css";

type SidebarLocationSectionProps = {
  node: DependencyNode;
};

export function SidebarLocationSection({ node }: SidebarLocationSectionProps) {
  const locationInfo = getNodeLocationInfo(node);

  if (locationInfo == null) {
    return null;
  }

  return (
    <div role="region" aria-label={t`Location`}>
      <Breadcrumbs
        lh="1rem"
        separator={<FixedSizeIcon name="chevronright" size={12} />}
      >
        {locationInfo.links.map((link, linkIndex) => (
          <Anchor
            key={linkIndex}
            component={Link}
            className={cx(CS.textWrap, S.link)}
            lh="1rem"
            to={link.url}
          >
            <Group gap="sm" wrap="nowrap">
              {linkIndex === 0 && <FixedSizeIcon name={locationInfo.icon} />}
              {link.label}
            </Group>
          </Anchor>
        ))}
      </Breadcrumbs>
    </div>
  );
}
