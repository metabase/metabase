// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import type { DependentMetadataItem, DatasetQuery } from "metabase-types/api";
import type Metadata from "metabase-lib/metadata/Metadata";
import type Question from "metabase-lib/Question";
import Dimension from "metabase-lib/Dimension";
import type Variable from "metabase-lib/variables/Variable";
import DimensionOptions from "metabase-lib/DimensionOptions";

/**
 * An abstract class for all query types (StructuredQuery & NativeQuery)
 */
class Query {
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
  question = _.once((): Question => {
    return this._originalQuestion.setQuery(this);
  });

  /**
   * Returns a "clean" version of this query with invalid parts removed
   */
  clean() {
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

  setDatasetQuery(_datasetQuery: DatasetQuery): Query {
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
    _filter?: (dimension: Dimension) => boolean,
  ): DimensionOptions {
    return new DimensionOptions();
  }

  /**
   * Variables exposed by this query
   */
  variables(_filter?: (variable: Variable) => boolean): Variable[] {
    return [];
  }

  /**
   * Metadata this query needs to display correctly
   */
  dependentMetadata(): DependentMetadataItem[] {
    return [];
  }

  setDefaultQuery(): Query {
    return this;
  }

  parseFieldReference(fieldRef, query = this): Dimension | null | undefined {
    return Dimension.parseMBQL(fieldRef, this._metadata, query);
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Query;
