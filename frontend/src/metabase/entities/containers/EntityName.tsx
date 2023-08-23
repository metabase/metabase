import EntityObjectLoader from "./EntityObjectLoader";

type EntityId = string | number;

interface EntityNameProps {
  entityType: string;
  entityId: EntityId;
  property?: string;
}

interface EntityWrapper {
  getName: () => string;
}

export const EntityName = ({
  entityType,
  entityId,
  property = "name",
}: EntityNameProps) => {
  return (
    <EntityObjectLoader
      entityType={entityType}
      entityId={entityId}
      properties={[property]}
      loadingAndErrorWrapper={false}
      wrapped
    >
      {({ object }: { object: EntityWrapper }) =>
        object ? <span>{object.getName()}</span> : null
      }
    </EntityObjectLoader>
  );
};
