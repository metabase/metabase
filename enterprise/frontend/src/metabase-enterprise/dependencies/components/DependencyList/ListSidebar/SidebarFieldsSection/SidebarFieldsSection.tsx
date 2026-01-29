import { t } from "ttag";

import type { DependencyNode } from "metabase-types/api";

import { getNodeFields, getNodeFieldsLabel } from "../../../../utils";
import { SidebarListSection } from "../SidebarListSection";

type SidebarFieldsSectionProps = {
  node: DependencyNode;
};

export function SidebarFieldsSection({ node }: SidebarFieldsSectionProps) {
  const fields = getNodeFields(node);

  return (
    <SidebarListSection
      title={getNodeFieldsLabel(fields.length)}
      items={fields.map((field) => field.display_name)}
      badgeColor="brand"
      aria-label={t`Fields`}
    />
  );
}
