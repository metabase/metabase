import type { DependencyNode } from "metabase-types/api";

import type { DependencyErrorGroup } from "../../../../types";
import {
  getDependencyErrorGroups,
  getDependencyErrors,
  getErrorTypeLabel,
} from "../../../../utils";
import { SidebarListSection } from "../SidebarListSection";

type SidebarErrorSectionProps = {
  node: DependencyNode;
};

export function SidebarErrorSection({ node }: SidebarErrorSectionProps) {
  const errors = getDependencyErrors(node.dependents_errors ?? []);
  const errorGroups = getDependencyErrorGroups(errors);

  return (
    <>
      {errorGroups.map((group) => (
        <ErrorGroupSection key={group.type} group={group} />
      ))}
    </>
  );
}

type ErrorGroupSectionProps = {
  group: DependencyErrorGroup;
};

function ErrorGroupSection({ group }: ErrorGroupSectionProps) {
  const { type, errors } = group;
  const count = errors.length;
  const details = errors
    .map((error) => error.detail)
    .filter((detail) => detail != null);

  return (
    <SidebarListSection
      title={getErrorTypeLabel(type, count)}
      items={details}
      badgeColor="error"
      isMonospace
      aria-label={getErrorTypeLabel(type)}
    />
  );
}
