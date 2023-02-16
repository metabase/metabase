import type { CardId, WritebackActionId } from "metabase-types/api";
import { modelDetail } from "./models";

type ParentModelProps = {
  id: CardId;
  name?: string;
};

export function newAction(parentModel: ParentModelProps) {
  const model = { ...parentModel, dataset: true };
  const baseUrl = modelDetail(model, "actions");
  return `${baseUrl}/new`;
}

export function runAction(
  parentModal: ParentModelProps,
  actionId: WritebackActionId,
) {
  const baseUrl = action(parentModal, actionId);
  return `${baseUrl}/run`;
}

export function action(
  parentModel: ParentModelProps,
  actionId: WritebackActionId,
) {
  const model = { ...parentModel, dataset: true };
  const baseUrl = modelDetail(model, "actions");
  return `${baseUrl}/${actionId}`;
}

export function publicAction(siteUrl: string, uuid: string) {
  return `${siteUrl}/public/action/${uuid}`;
}
