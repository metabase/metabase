export interface MentionParams {
  model: string;
  entityId: string;
}

export const getMentionsCacheKey = ({ model, entityId }: MentionParams) =>
  `${model}:${entityId}`;
