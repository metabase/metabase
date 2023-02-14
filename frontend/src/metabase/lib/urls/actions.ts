import type { WritebackAction } from "metabase-types/api";

export function action(action: WritebackAction) {
  return `/model/${action.model_id}/detail/actions/${action.id}`;
}

export function publicAction(siteUrl: string, uuid: string) {
  return `${siteUrl}/public/action/${uuid}`;
}
