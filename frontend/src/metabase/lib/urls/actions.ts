import type { CardId, WritebackActionId } from "metabase-types/api";

import { modelDetail } from "./models";

type ParentModelProps = {
  id: CardId;
  name?: string;
};

export function newAction(parentModel: ParentModelProps) {
  const baseUrl = modelDetail(parentModel, "actions");
  return `${baseUrl}/new`;
}

export function action(
  parentModel: ParentModelProps,
  actionId: WritebackActionId,
) {
  const baseUrl = modelDetail(parentModel, "actions");
  return `${baseUrl}/${actionId}`;
}

export function publicAction(siteUrl: string, uuid: string) {
  return `${siteUrl}/public/action/${uuid}`;
}
