import type { UniqueIdentifier } from "@dnd-kit/core";

import type { ObjectViewSectionSettings } from "metabase-types/api";

export function getSectionDraggableKey(section: ObjectViewSectionSettings) {
  return `section-${section.id}`;
}

export function getFieldDraggableKey(field: { field_id: number }) {
  return `field-${field.field_id}`;
}

export type DraggableKey = {
  type: "section" | "field";
  id: number;
};

export function parseDraggableKey(
  key?: UniqueIdentifier | null,
): DraggableKey | null {
  if (key == null || typeof key !== "string") {
    return null;
  }

  const [type, id] = key.split("-");

  if (type === "section") {
    return { type: "section", id: Number(id) };
  }

  if (type === "field") {
    return { type: "field", id: Number(id) };
  }

  return null;
}
export function isFieldDraggableKey(key?: UniqueIdentifier | null): boolean {
  if (key == null || typeof key !== "string") {
    return false;
  }
  return key.startsWith("field-");
}

export function isSectionDraggableKey(key?: UniqueIdentifier | null): boolean {
  if (key == null || typeof key !== "string") {
    return false;
  }
  return key.startsWith("section-");
}
