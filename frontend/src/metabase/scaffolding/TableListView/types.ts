import type {
  ComponentSettings,
  FieldId,
  ListViewTableSettings,
  ObjectViewSectionSettings,
  ObjectViewSettings,
  TableId,
} from "metabase-types/api";

export interface RouteParams {
  page?: string;
  tableId: string;
}

export type ParsedRouteParams = {
  page: number;
  tableId: TableId;
};

function isFieldId(value: unknown): value is FieldId {
  return typeof value === "number";
}

function isListViewTableSettings(
  value: unknown,
): value is ListViewTableSettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const object = value as Record<string, unknown>;

  if (typeof object.row_height !== "string") {
    return false;
  }

  if (!Array.isArray(object.fields)) {
    return false;
  }

  return object.fields.every((field) => {
    if (!field || typeof field !== "object") {
      return false;
    }

    const fieldObject = field as Record<string, unknown>;

    if (!isFieldId(fieldObject.field_id)) {
      return false;
    }

    if (typeof fieldObject.style !== "string") {
      return false;
    }

    return true;
  });
}

function isObjectViewSectionSettings(
  value: unknown,
): value is ObjectViewSectionSettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const object = value as Record<string, unknown>;

  if (typeof object.id !== "number") {
    return false;
  }

  if (typeof object.title !== "string") {
    return false;
  }

  if (typeof object.direction !== "string") {
    return false;
  }

  if (!Array.isArray(object.fields)) {
    return false;
  }

  return object.fields.every((field) => {
    if (!field || typeof field !== "object") {
      return false;
    }

    const fieldObject = field as Record<string, unknown>;

    if (!isFieldId(fieldObject.field_id)) {
      return false;
    }

    if (typeof fieldObject.style !== "string") {
      return false;
    }

    return true;
  });
}

function isObjectViewSettings(value: unknown): value is ObjectViewSettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const object = value as Record<string, unknown>;

  if (!Array.isArray(object.sections)) {
    return false;
  }

  return object.sections.every(isObjectViewSectionSettings);
}

export function isComponentSettings(
  value: unknown,
): value is ComponentSettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const object = value as Record<string, unknown>;

  if (!object.list_view || typeof object.list_view !== "object") {
    return false;
  }

  const listView = object.list_view as Record<string, unknown>;

  if (!isListViewTableSettings(listView.table)) {
    return false;
  }

  if (!isObjectViewSettings(listView.list)) {
    return false;
  }

  if (!isObjectViewSettings(listView.gallery)) {
    return false;
  }

  if (!isObjectViewSettings(object.object_view)) {
    return false;
  }

  return true;
}
