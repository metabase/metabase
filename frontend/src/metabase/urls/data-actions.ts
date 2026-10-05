import type { CollectionId, WritebackActionId } from "metabase-types/api";

const DATA_ACTIONS_ROOT_URL = `/data-studio/actions`;

export type DataActionListParams = {
  collectionId?: CollectionId;
};

export function dataActionList({ collectionId }: DataActionListParams = {}) {
  return collectionId != null
    ? `${DATA_ACTIONS_ROOT_URL}?${new URLSearchParams({ collectionId: String(collectionId) })}`
    : DATA_ACTIONS_ROOT_URL;
}

export function newDataAction() {
  return `${DATA_ACTIONS_ROOT_URL}/new`;
}

export function dataAction(actionId: WritebackActionId) {
  return `${DATA_ACTIONS_ROOT_URL}/${actionId}`;
}

export function dataActionEdit(actionId: WritebackActionId) {
  return `${dataAction(actionId)}/edit`;
}

export function dataActionRun(actionId: WritebackActionId) {
  return `${dataAction(actionId)}/run`;
}

export function dataActionSettings(actionId: WritebackActionId) {
  return `${dataAction(actionId)}/settings`;
}

export function dataActionDependencies(actionId: WritebackActionId) {
  return `${dataAction(actionId)}/dependencies`;
}
