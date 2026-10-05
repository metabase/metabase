import type {
  CardId,
  CollectionId,
  WritebackActionId,
} from "metabase-types/api";

import { modelDetail } from "./models";

type ParentModelProps = {
  id: CardId;
  name?: string;
};

export function newAction(parentModel: ParentModelProps) {
  const baseUrl = modelDetail(parentModel, "actions");
  return `${baseUrl}/new`;
}

export function modelAction(
  parentModel: ParentModelProps,
  actionId: WritebackActionId,
) {
  const baseUrl = modelDetail(parentModel, "actions");
  return `${baseUrl}/${actionId}`;
}

export function publicAction(siteUrl: string, uuid: string) {
  return `${siteUrl}/public/action/${uuid}`;
}

const DATA_ACTIONS_ROOT_URL = `/data-studio/data-actions`;

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

export function dataActionFields(
  actionId: WritebackActionId,
  fieldId?: string,
) {
  const fieldsUrl = `${dataAction(actionId)}/fields`;
  return fieldId != null
    ? `${fieldsUrl}/${encodeURIComponent(fieldId)}`
    : fieldsUrl;
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
