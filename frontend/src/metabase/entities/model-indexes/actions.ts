import _ from "underscore";

import { modelIndexesApi } from "metabase/api";
import type Question from "metabase-lib/Question";
import type { FieldWithMaybeIndex } from "metabase-types/api";
import type { ModelIndex } from "metabase-types/api/modelIndexes";
import type { Dispatch } from "metabase-types/store";

import { getPkRef } from "./utils";

export const updateModelIndexes =
  (model: Question) => async (dispatch: Dispatch, getState: any) => {
    const fields = model.getResultMetadata();

    const fieldsWithIndexFlags = fields.filter(
      (field: FieldWithMaybeIndex) => field.should_index !== undefined,
    );

    if (fieldsWithIndexFlags.length === 0) {
      return;
    }

    const listResultSelector =
      modelIndexesApi.endpoints.listModelIndexes.select(model.id());
    const existingIndexes: ModelIndex[] =
      listResultSelector(getState()).data ?? [];

    const newFieldsToIndex = getFieldsToIndex(
      fieldsWithIndexFlags,
      existingIndexes,
    );
    const indexIdsToRemove = getIndexIdsToRemove(
      fieldsWithIndexFlags,
      existingIndexes,
    );

    if (newFieldsToIndex.length) {
      const pkRef = getPkRef(fields);

      if (pkRef) {
        await Promise.all(
          newFieldsToIndex.map(field =>
            dispatch(
              modelIndexesApi.endpoints.createModelIndex.initiate({
                model_id: model.id(),
                value_ref: field.field_ref,
                pk_ref: pkRef,
              }),
            ),
          ),
        );
      }
    }

    if (indexIdsToRemove.length) {
      await Promise.all(
        indexIdsToRemove.map(indexId =>
          dispatch(
            ModelIndexes.api.endpoints.deleteModelIndex.initiate(indexId),
          ),
        ),
      );
    }
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
