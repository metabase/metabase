import { type EntityId, type EntityType, useGetEntityQuery } from "./rtk-query";

interface Props {
  entityId: EntityId;
  entityType: EntityType;
}

export const EntityName = ({ entityType, entityId }: Props) => {
  const { data: entity } = useGetEntityQuery({
    entityType,
    query: { id: entityId },
  });

  if (!entity) {
    return null;
  }

  return <span>{entity.display_name ?? entity.name}</span>;
};
