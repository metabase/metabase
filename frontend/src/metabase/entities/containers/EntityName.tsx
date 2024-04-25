import type Question from "metabase-lib/v1/Question";

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
  // This is a special case for questions, because we're returning `metabase-lib/v1/Question`
  // from question entity's `getObject` in https://github.com/metabase/metabase/pull/30729.
  // If we wrap it in `EntityWrapper`, we'd lose all properties from `metabase-lib/v1/Question`.
  if (entityType === "questions") {
    return (
      <EntityObjectLoader
        entityType={entityType}
        entityId={entityId}
        properties={[property]}
        loadingAndErrorWrapper={false}
      >
        {({ object: question }: { object: Question }) =>
          question ? <span>{question.displayName()}</span> : null
        }
      </EntityObjectLoader>
    );
  }

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
