import type {
  KnownWorkspaceProblemData,
  WorkspaceProblemDataExternalDownstreamNotRun,
  WorkspaceProblemDataInternalDownstreamNotRun,
  WorkspaceProblemDataRemovedField,
  WorkspaceProblemDataUnusedNotRun,
} from "metabase-types/api";

import { isObject } from "./common";

export function isKnownWorkspaceProblemData(
  value: unknown,
): value is KnownWorkspaceProblemData {
  return (
    isWorkspaceProblemDataExternalDownstreamNotRun(value) ||
    isWorkspaceProblemDataUnusedNotRun(value) ||
    isWorkspaceProblemDataInternalDownstreamNotRun(value) ||
    isWorkspaceProblemDataExternalDownstreamNotRun(value)
  );
}

export function isWorkspaceProblemDataRemovedField(
  value: unknown,
): value is WorkspaceProblemDataRemovedField {
  return (
    isObject(value) &&
    isObject(value.output) &&
    typeof value.output.db_id === "number" &&
    typeof value.output.table === "string" &&
    isObject(value.transform) &&
    value.transform.type === "external-transform" &&
    typeof value.transform.id === "number" &&
    typeof value.transform.name === "string" &&
    Array.isArray(value["bad-refs"])
  );
}

export function isWorkspaceProblemDataUnusedNotRun(
  value: unknown,
): value is WorkspaceProblemDataUnusedNotRun {
  return (
    isObject(value) &&
    isObject(value.output) &&
    typeof value.output.db_id === "number" &&
    typeof value.output.table === "string" &&
    isObject(value.transform) &&
    (value.transform.type === "workspace-transform" ||
      value.transform.type === "external-transform") &&
    (typeof value.transform.id === "string" ||
      typeof value.transform.id === "number") &&
    !("dependents" in value)
  );
}

export function isWorkspaceProblemDataInternalDownstreamNotRun(
  value: unknown,
): value is WorkspaceProblemDataInternalDownstreamNotRun {
  return (
    isObject(value) &&
    isObject(value.output) &&
    typeof value.output.db_id === "number" &&
    typeof value.output.table === "string" &&
    isObject(value.transform) &&
    Array.isArray(value.dependents) &&
    value.dependents.every(
      (dep: unknown) =>
        isObject(dep) &&
        dep.type === "workspace-transform" &&
        typeof dep.id === "string",
    )
  );
}

export function isWorkspaceProblemDataExternalDownstreamNotRun(
  value: unknown,
): value is WorkspaceProblemDataExternalDownstreamNotRun {
  return (
    isObject(value) &&
    isObject(value.output) &&
    typeof value.output.db_id === "number" &&
    typeof value.output.table === "string" &&
    isObject(value.transform) &&
    Array.isArray(value.dependents) &&
    value.dependents.every(
      (dep: unknown) =>
        isObject(dep) &&
        dep.type === "external-transform" &&
        typeof dep.id === "number" &&
        typeof dep.name === "string",
    )
  );
}
