import { dissocIn } from "icepick";
import _ from "underscore";

import type Question from "metabase-lib/v1/Question";
import type { FieldReference, Field } from "metabase-types/api";
import type { ModelIndex } from "metabase-types/api/modelIndexes";
import type { Dispatch } from "metabase-types/store";

import { ModelIndexes } from "./model-indexes";

export type FieldWithMaybeIndex = Field & {
  should_index?: boolean;
  field_ref?: FieldReference;
};

export const updateModelIndexes =
  (model: Question) => async (dispatch: Dispatch, getState: any) => {
    const fields = model.getResultMetadata();

    const fieldsWithIndexFlags = fields.filter(
      (field: FieldWithMaybeIndex) => field.should_index !== undefined,
    );

    if (fieldsWithIndexFlags.length === 0) {
      return;
    }

    const existingIndexes: ModelIndex[] =
      ModelIndexes.selectors.getList(getState(), {
        entityQuery: { model_id: model.id() },
      }) ?? [];

    const newFieldsToIndex = getFieldsToIndex(
      fieldsWithIndexFlags,
      existingIndexes,
    );
    const indexIdsToRemove = getIndexIdsToRemove(
      fieldsWithIndexFlags,
      existingIndexes,
    );

    if (newFieldsToIndex.length) {
      const pkRef = ModelIndexes.utils.getPkRef(fields);

      if (pkRef) {
        await Promise.all(
          newFieldsToIndex.map(field =>
            ModelIndexes.api.create({
              model_id: model.id(),
              value_ref: field.field_ref,
              pk_ref: pkRef,
            }),
          ),
        );
      }
    }

    if (indexIdsToRemove.length) {
      await Promise.all(
        indexIdsToRemove.map(indexId =>
          ModelIndexes.api.delete({ id: indexId }),
        ),
      );
    }

    dispatch(ModelIndexes.actions.invalidateLists());
  };

function getFieldsToIndex(
  fieldsWithIndexFlags: FieldWithMaybeIndex[],
  existingIndexes: ModelIndex[],
) {
  // make sure none of these fields are already indexed by this model
  const newFieldsToIndex = fieldsWithIndexFlags.filter(
    field =>
      field.should_index &&
      !existingIndexes.some((index: ModelIndex) =>
        _.isEqual(index.value_ref, field.field_ref),
      ),
  );

  return newFieldsToIndex;
}

function getIndexIdsToRemove(
  fieldsWithIndexFlags: FieldWithMaybeIndex[],
  existingIndexes: ModelIndex[],
) {
  const indexIdsToRemove = fieldsWithIndexFlags.reduce(
    (indexIdsToRemove: number[], field) => {
      if (field.should_index) {
        return indexIdsToRemove;
      }

      // make sure we're only removing already-indexed fields
      const foundIndex = existingIndexes.find((index: ModelIndex) =>
        _.isEqual(index.value_ref, field.field_ref),
      );

      if (foundIndex) {
        indexIdsToRemove.push(foundIndex.id);
      }

      return indexIdsToRemove;
    },
    [],
  );

  return indexIdsToRemove;
}

export function cleanIndexFlags(fields: Field[] = []) {
  const indexesToClean = fields.reduce(
    (
      indexesToClean: number[],
      field: FieldWithMaybeIndex,
      thisIndex: number,
    ) => {
      if (field.should_index !== undefined) {
        indexesToClean.push(thisIndex);
      }
      return indexesToClean;
    },
    [],
  );

  const newResultMetadata = [...fields];
  for (const index of indexesToClean) {
    newResultMetadata[index] = dissocIn(newResultMetadata[index], [
      "should_index",
    ]);
  }
  return newResultMetadata;
}
