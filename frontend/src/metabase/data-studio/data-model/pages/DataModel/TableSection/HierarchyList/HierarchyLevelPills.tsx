import { Fragment } from "react";
import { t } from "ttag";

import type { Hierarchy } from "metabase/metadata/hierarchies";
import { Flex, Group, Icon, Pill } from "metabase/ui";
import type { Field, IconName } from "metabase-types/api";

import type { FindLevelColumn } from "./use-level-columns";

type LevelPill = { key: string; label: string; icon: IconName };

function LabeledPill({ label, icon }: Omit<LevelPill, "key">) {
  return (
    <Pill bdrs="xl">
      <Flex component="span" align="center" gap="xs">
        <Icon name={icon} size={12} c="text-secondary" />
        {label}
      </Flex>
    </Pill>
  );
}

/**
 * A hierarchy's levels in order, top first, as pills with arrows between.
 * A recursive one shows its parent key, then its depth and path columns.
 */
export function HierarchyLevelPills({
  hierarchy,
  fields,
  findColumn,
}: {
  hierarchy: Pick<
    Hierarchy,
    "kind" | "levels" | "parentKeyFieldId" | "depthFieldId" | "pathFieldId"
  >;
  fields: Field[];
  findColumn: FindLevelColumn;
}) {
  const getFieldName = (fieldId: number | undefined) =>
    fields.find(({ id }) => id === fieldId)?.display_name;

  if (hierarchy.kind === "recursive") {
    const pills: LevelPill[] = [];
    const parentName = getFieldName(hierarchy.parentKeyFieldId);
    const depthName = getFieldName(hierarchy.depthFieldId);
    const pathName = getFieldName(hierarchy.pathFieldId);
    if (parentName) {
      pills.push({
        key: "parent",
        label: t`Parent key: ${parentName}`,
        icon: "key",
      });
    }
    if (depthName) {
      pills.push({ key: "depth", label: t`Depth: ${depthName}`, icon: "int" });
    }
    if (pathName) {
      pills.push({ key: "path", label: t`Path: ${pathName}`, icon: "string" });
    }
    return (
      <Group gap="xs" wrap="wrap">
        {pills.map(({ key, ...pill }) => (
          <LabeledPill key={key} {...pill} />
        ))}
      </Group>
    );
  }

  return (
    <Group gap="xs" wrap="wrap">
      {hierarchy.levels.map((level, index) => {
        const column = findColumn(level);
        return (
          <Fragment key={`${level.viaFieldId ?? ""}:${level.fieldId}`}>
            {index > 0 && (
              <Icon name="chevronright" size={10} c="text-secondary" />
            )}
            <LabeledPill
              label={column?.label ?? t`Missing column`}
              icon={column?.icon ?? "unknown"}
            />
          </Fragment>
        );
      })}
    </Group>
  );
}
