/* @flow weak */

import type { DatasetQuery } from "metabase-types/types/Card";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type Question from "metabase-lib/lib/Question";
import type Dimension from "metabase-lib/lib/Dimension";
import type Variable from "metabase-lib/lib/Variable";

import { memoize } from "metabase-lib/lib/utils";

import DimensionOptions from "metabase-lib/lib/DimensionOptions";

type QueryUpdateFn = (datasetQuery: DatasetQuery) => void;

/**
 * An abstract class for all query types (StructuredQuery & NativeQuery)
 */
export default class Query {
  _metadata: Metadata;

  /**
   * Note that Question is not always in sync with _datasetQuery,
   * calling question() will always merge the latest _datasetQuery to the question object
   */
  _originalQuestion: Question;
  _datasetQuery: DatasetQuery;

  constructor(question: Question, datasetQuery: DatasetQuery) {
    this._metadata = question._metadata;
    this._datasetQuery = datasetQuery;
    this._originalQuestion = question;
  }

  /**
   * Returns a question updated with the current dataset query.
   * Can only be applied to query that is a direct child of the question.
   */
  @memoize
  question(): Question {
    return this._originalQuestion.setQuery(this);
  }

  /**
   * Returns a "clean" version of this query with invalid parts removed
   */
  clean(): Query {
    return this;
  }

  /**
   * Convenience method for accessing the global metadata
   */
  metadata() {
    return this._metadata;
  }

  /**
   * Does this query have the sufficient metadata for editing it?
   */
  isEditable(): boolean {
    return true;
  }

  /**
   * Returns the dataset_query object underlying this Query
   */
  datasetQuery(): DatasetQuery {
    return this._datasetQuery;
  }

  setDatasetQuery(datasetQuery: DatasetQuery): Query {
    return this;
  }

  /**
   *
   * Query is considered empty, i.e. it is in a plain state with no properties / query clauses set
   */
  isEmpty(): boolean {
    return false;
  }

  /**
   * Query is valid (as far as we know) and can be executed
   */
  canRun(): boolean {
    return false;
  }

  /**
   * Returns true if the database metadata (or lack thererof indicates the user can modify and run this query
   */
  readOnly(): boolean {
    return true;
  }

  /**
   * Dimensions exposed by this query
   * NOTE: Ideally we'd also have `dimensions()` that returns a flat list, but currently StructuredQuery has it's own `dimensions()` for another purpose.
   */
  dimensionOptions(
    filter: (dimension: Dimension) => boolean,
  ): DimensionOptions {
    return new DimensionOptions();
  }

  /**
   * Variables exposed by this query
   */
  variables(filter: (variable: Variable) => boolean): Variable[] {
    return [];
  }

  /**
   * Metadata this query needs to display correctly
   */
  dependentMetadata() {
    return [];
  }

  setDefaultQuery(): Query {
    return this;
  }

  /**
   * Helper for updating with functions that expect a DatasetQuery object, or proxy to parent question
   */
  update(update?: QueryUpdateFn, ...args: any[]) {
    if (update) {
      return update(this.datasetQuery(), ...args);
    } else {
      return this.question().update(undefined, ...args);
    }
  }
}
