import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { EntityObjectLoader, type EntityType } from "./rtk-query";

type EntityId = string | number;

interface EntityNameProps {
  entityType: EntityType;
  entityId: EntityId;
  property?: string;
}

interface EntityWrapper {
  getName: () => string;
}

const isEntityWrapper = (value: unknown): value is EntityWrapper =>
  isObject(value) && "getName" in value && typeof value.getName === "function";

const isQuestion = (value: unknown): value is Question =>
  value instanceof Question;

export const EntityName = ({ entityType, entityId }: EntityNameProps) => {
  // This is a special case for questions, because we're returning `metabase-lib/v1/Question`
  // from question entity's `getObject` in https://github.com/metabase/metabase/pull/30729.
  // If we wrap it in `EntityWrapper`, we'd lose all properties from `metabase-lib/v1/Question`.
  if (entityType === "questions") {
    return (
      <EntityObjectLoader<Card, Question>
        ComposedComponent={({ object: question }) => {
          const name = isQuestion(question)
            ? question.displayName()
            : question?.name;
          return name ? <span>{name}</span> : null;
        }}
        entityQuery={{}}
        entityType={entityType}
        entityId={entityId}
        loadingAndErrorWrapper={false}
      />
    );
  }

  return (
    <EntityObjectLoader<unknown, EntityWrapper>
      ComposedComponent={({ object }) => {
        return isEntityWrapper(object) ? <span>{object.getName()}</span> : null;
      }}
      entityQuery={{}}
      entityType={entityType}
      entityId={entityId}
      loadingAndErrorWrapper={false}
      wrapped
    />
  );
};
