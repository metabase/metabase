import type { CardId } from "metabase-types/api";
import { modelDetail } from "./models";

type ParentModelProps = {
  id: CardId;
  name: string;
};

export function newAction(parentModel: ParentModelProps) {
  const baseUrl = modelDetail(parentModel, "actions");
  return `${baseUrl}/new`;
}

export function publicAction(siteUrl: string, uuid: string) {
  return `${siteUrl}/public/action/${uuid}`;
}
