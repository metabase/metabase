import { dissocIn } from "icepick";
import _ from "underscore";

import {
  createModelIndex,
  deleteModelIndex,
  listModelIndexes,
} from "metabase/api";
import type Question from "metabase-lib/v1/Question";
import type { FieldReference, Field } from "metabase-types/api";
import type { ModelIndex } from "metabase-types/api/modelIndexes";
import type { Dispatch } from "metabase-types/store";

import { getPkRef } from "./utils";

export type FieldWithMaybeIndex = Field & {
  should_index?: boolean;
};

type FieldWithIndexAndRef = Field & {
  should_index: boolean;
  field_ref: FieldReference;
};

const filterForRefAndShouldIndex = (
  field: FieldWithMaybeIndex,
): field is FieldWithIndexAndRef => {
  return field.should_index !== undefined && !!field.field_ref;
};

export const updateModelIndexes =
  (model: Question) => async (dispatch: Dispatch) => {
    const fields = model.getResultMetadata();

    const fieldsWithIndexFlags = fields.filter(filterForRefAndShouldIndex);

    if (fieldsWithIndexFlags.length === 0) {
      return;
    }

    const { data: existingIndexes = [] } = await (dispatch(
      listModelIndexes.initiate({ model_id: model.id() }),
    ) as Promise<{ data: ModelIndex[] }>);

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
          newFieldsToIndex.map(field => {
            return dispatch(
              createModelIndex.initiate({
                model_id: model.id(),
                value_ref: field.field_ref,
                pk_ref: pkRef,
              }),
            );
          }),
        );
      }
    }

    if (indexIdsToRemove.length) {
      await Promise.all(
        indexIdsToRemove.map(indexId =>
          dispatch(deleteModelIndex.initiate({ id: indexId })),
        ),
      );
    }
  };

function getFieldsToIndex(
  fieldsWithIndexFlags: FieldWithIndexAndRef[],
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
  fieldsWithIndexFlags: FieldWithIndexAndRef[],
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
