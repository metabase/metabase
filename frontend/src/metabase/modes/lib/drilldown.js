import { isa, TYPE } from "metabase/lib/types";
import { isLatitude, isLongitude, isDate } from "metabase/lib/schema_metadata";

import _ from "underscore";

import { FieldDimension } from "metabase-lib/lib/Dimension";
import { isExpressionField } from "metabase/lib/query/field_ref";
// Drill-down progressions are defined as a series of steps, where each step has one or more dimension <-> breakout
// transforms.
//
// Drill-down progressions are defined with the format
//
// PROGRESSION = [STEP+]
//
// Collectively a sequence of CONDITIONS/TRANSFORMS is a STEP; CONDITIONS happen as the first step.
//
// PROGRESSION = [[CONDITION+] [TRANSFORM+]]

// TODO - I think this class hierarchy could be improved a bit by having a Conditions/Transforms be composable

/**
 * Represents part of a progression step applied to a single column (a step as a whole applies to one or more columns).
 *
 * Transforms that are only used in the first step in a progression are called `Condition`s below to signify their
 * purpose. The first step is only used to match the current
 * breakouts and thus doesn't need to know how to apply transformations to dimensions. This is a subset of
 * `Transform` below.
 */
class Transform {
  /** Predicate function that takes a FieldDimension and returns whether or not the step should be considered the same
   *  as the current breakout in question. This can be a simple check to make sure the underlying MBQL clause is the
   *  same, or something more sophisticated e.g. checking that options are in a range.
   */
  matchesDimension(dimension: FieldDimension) {
    return true;
  }

  matchesDimensions(dimensions: FieldDimension[]) {
    return _.some(dimensions, dimension => this.matchesDimension(dimension));
  }

  /**
   * Predicate function that detemines whether a given dimension can be used for this drill-thru step. Not used for the
   * first step in a progression. This dimension is not necessarily one used in the current breakout.
   */
  canBeAppliedToDimension(dimension: FieldDimension) {
    return true;
  }

  /** Apply the drill-down step to the FieldDimension, returning an updated dimension. This is not used for the first
   *  step in a drill-down progression.
   */
  applyToDimension(dimension: FieldDimension): FieldDimension {
    return dimension;
  }
}

/**
 * First-step identity transform that matches any dimension with a matching semantic type.
 * This is really just a Condition but we're extending Transform instead because we can't do multipe
 */
class IsCategoryCondition extends Transform {
  _type: string;

  constructor(type) {
    super();
    this._type = type;
  }

  matchesDimension(dimension) {
    return isa(dimension.field().semantic_type, this._type);
  }
}

class NextCategoryTransform extends IsCategoryCondition {
  _previousType: string;

  constructor(previousType, currentType) {
    super(currentType);
    this._previousType = previousType;
  }

  canBeAppliedToDimension(dimension) {
    return isa(dimension.field().semantic_type, this._previousType);
  }
}

/**
 * A drill-down transform that matches a datetime column bucketed by a temporal unit.
 */
class TemporalBucketingTransform extends Transform {
  _unit: string;

  constructor(unit) {
    super();
    this._unit = unit;
  }

  matchesDimension(dimension) {
    return isDate(dimension.field()) && dimension.temporalUnit() === this._unit;
  }

  canBeAppliedToDimension(dimension) {
    return isDate(dimension.field());
  }

  applyToDimension(dimension) {
    return dimension.withTemporalUnit(this._unit);
  }
}

class IsLatLonCondition extends Transform {
  _fieldPredicate: ({}) => boolean;

  constructor(fieldPredicate) {
    super();
    this._fieldPredicate = fieldPredicate;
  }

  matchesDimension(dimension) {
    return this._fieldPredicate(dimension.field());
  }

  canBeAppliedToDimension(dimension) {
    return this._fieldPredicate(dimension.field());
  }
}

class LatLonZoomTransform extends IsLatLonCondition {
  /**
   * Given the current bin-width, return the new zoomed-in smaller bin-width.
   */
  zoomedBinWidth(currentBinWidth) {
    return currentBinWidth;
  }

  applyToDimension(dimension) {
    return dimension.withBinningOptions({
      strategy: "bin-width",
      "bin-width": this.zoomedBinWidth(dimension.getBinningOption("bin-width")),
    });
  }
}

class LatLonFixedZoomTransform extends LatLonZoomTransform {
  _binWidth: number;

  constructor(fieldPredicate, binWidth) {
    super(fieldPredicate);
    this._binWidth = binWidth;
  }

  zoomedBinWidth() {
    return this._binWidth;
  }
}

class LatLonIsZoomedOutCondition extends IsLatLonCondition {
  matchesDimension(dimension) {
    return (
      super.canBeAppliedToDimension(dimension) &&
      dimension.getBinningOption("bin-width") >= 20
    );
  }
}

class LatLonZoomRatioTransform extends LatLonZoomTransform {
  _zoomRatio: number;

  constructor(fieldPredicate, zoomRatio = 10) {
    super(fieldPredicate);
    this._zoomRatio = 10;
  }

  canBeAppliedToDimension(dimension) {
    return (
      super.canBeAppliedToDimension(dimension) &&
      dimension.binningStrategy() === "bin-width"
    );
  }

  applyToDimension(dimension) {
    return dimension.withBinningOptions({
      ...dimension.binningOptions(),
      "bin-width": dimension.getBinningOption("bin-width") / this._zoomRatio,
    });
  }
}

/**
 * A drill-down condition that matches any dimension using binning `strategy`. Intended as a first step in a
 * progression.
 */
class IsBinnedCondition extends Transform {
  _strategy: string;

  constructor(strategy) {
    super();
    this._strategy = strategy;
  }

  matchesDimension(dimension) {
    return dimension.binningStrategy() === this._strategy;
  }
}

/**
 * A drill-down transform that switches the binning strategy to default.
 */
class DefaultBinningTransform extends Transform {
  matchesDimension(dimension) {
    return dimension.binningStrategy() === "default";
  }

  canBeAppliedToDimension(dimension) {
    return dimension.binningStrategy();
  }

  applyToDimension(dimension) {
    return dimension.withBinningOptions({
      strategy: "default",
    });
  }
}

/**
 * A drill-down transform that divides binning `bin-width` by 10.
 */
class BinWidthZoomTransform extends Transform {
  canBeAppliedToDimension(dimension) {
    return dimension.binningStrategy() === "bin-width";
  }

  applyToDimension(dimension) {
    return dimension.withBinningOptions({
      strategy: "bin-width",
      "bin-width": dimension.getBinningOption("bin-width") / 10,
    });
  }
}

/// Step definitions

/**
 * Represents one point in a drill-down progression. The first step in a progression is only used to determine whether
 * we are currently "in" that progression -- the other ones apply a series of transformations to breakouts
 */
class Step {
  _transforms: Transform[];

  constructor(transforms) {
    this._transforms = transforms;
  }
  /**
   * True if the current breakouts should be considered as matching this step, which means we can use the next step as
   * a progression of this one.
   */
  matchesDimensions(dimensions: FieldDimension[]) {
    return _.every(this._transforms, transform =>
      transform.matchesDimensions(dimensions),
    );
  }

  applyToDimensions(dimensions: FieldDimension[]): ?(FieldDimension[]) {
    const newBreakouts = this._transforms.map(transform => {
      const matchingDimension = _.find(dimensions, d =>
        transform.canBeAppliedToDimension(d),
      );
      return matchingDimension && transform.applyToDimension(matchingDimension);
    });

    return _.every(newBreakouts, breakout => !!breakout) ? newBreakouts : null;
  }
}

const TemporalBucketingTransformStep = unit =>
  new Step([new TemporalBucketingTransform(unit)]);

const IsCategoryConditionStep = type =>
  new Step([new IsCategoryCondition(type)]);

const NextCategoryTransformStep = (currentType, previousType) =>
  new Step([new NextCategoryTransform(currentType, previousType)]);

const IsLatLonConditionStep = new Step([
  new IsLatLonCondition(isLatitude),
  new IsLatLonCondition(isLongitude),
]);

const LatLonIsZoomedOutConditionStep = new Step([
  new LatLonIsZoomedOutCondition(isLatitude),
  new LatLonIsZoomedOutCondition(isLongitude),
]);

const LatLonFixedZoomTransformStep = binWidth =>
  new Step([
    new LatLonFixedZoomTransform(isLatitude, binWidth),
    new LatLonFixedZoomTransform(isLongitude, binWidth),
  ]);

/**
 * A step that zooms in already-binned lat & lon by a ratio of what it was before, default 10x.
 */
const LatLonZoomRatioTransformStep = (zoomRatio = 10) =>
  new Step([
    new LatLonZoomRatioTransform(isLatitude, zoomRatio),
    new LatLonZoomRatioTransform(isLongitude, zoomRatio),
  ]);

const IsBinnedConditionStep = strategy =>
  new Step([new IsBinnedCondition(strategy)]);

const DefaultBinningTransformStep = new Step([new DefaultBinningTransform()]);

const BinWidthZoomTransformStep = new Step([new BinWidthZoomTransform()]);

/* class ConstrainedTransformStep extends Step {
 *   constructor(extraConstraints, transforms) {
 *     super(transforms);
 *     this._extraConstraintStep = new Step(constraints);
 *   }
 *
 *   this.matchesDimensions(dimensions) {
 *     return this._extraConstraintStep.matchesDimensions(dimensions) && super.matchesDimensions(dimensions);
 *   }
 * }
 *
 * const ConstrainedStep = (conditionStep, transformStep) => new Step */

/**
 * Defines the built-in drill-down progressions
 */
const DEFAULT_DRILL_DOWN_PROGRESSIONS = [
  // DateTime drill downs
  [
    TemporalBucketingTransformStep("year"),
    TemporalBucketingTransformStep("quarter"),
    TemporalBucketingTransformStep("month"),
    TemporalBucketingTransformStep("week"),
    TemporalBucketingTransformStep("day"),
    TemporalBucketingTransformStep("hour"),
    TemporalBucketingTransformStep("minute"),
  ],
  // Country => State => City
  [
    IsCategoryConditionStep(TYPE.Country),
    NextCategoryTransformStep(TYPE.State, TYPE.Country),
    // CategoryDrillDown(TYPE.City)
  ],
  // Country, State, or City => LatLon
  [IsCategoryConditionStep(TYPE.Country), LatLonFixedZoomTransformStep(10)],
  [IsCategoryConditionStep(TYPE.State), LatLonFixedZoomTransformStep(1)],
  [IsCategoryConditionStep(TYPE.City), LatLonFixedZoomTransformStep(0.1)],
  // LatLon drill downs
  [LatLonIsZoomedOutConditionStep, LatLonFixedZoomTransformStep(10)],
  [IsLatLonConditionStep, LatLonZoomRatioTransformStep(10)],
  // generic num-bins drill down
  [IsBinnedConditionStep("num-bins"), DefaultBinningTransformStep],
  // generic bin-width drill down
  [IsBinnedConditionStep("bin-width"), BinWidthZoomTransformStep],
];

/**
 * Return index of the current step that in `progression` that matches dimensions, otherwise return -1;
 */
function currentStepNumberInProgression(progression, dimensions) {
  for (let i = 0; i < progression.length; i++) {
    const step = progression[i];
    if (step.matchesDimensions(dimensions)) {
      return i;
    }
  }
  return -1;
}

function matchingProgression(dimensions) {
  for (const progression of DEFAULT_DRILL_DOWN_PROGRESSIONS) {
    const currentStepNumber = currentStepNumberInProgression(
      progression,
      dimensions,
    );
    if (currentStepNumber >= 0 && currentStepNumber < progression.length - 1) {
      return [progression, currentStepNumber];
    }
  }
  return [null, -1];
}

function nextBreakouts(dimensionMaps, metadata) {
  const columns = dimensionMaps.map(d => d.column);
  const dimensions = columnsToFieldDimensions(columns, metadata);

  const [firstDimension] = dimensions;
  if (!firstDimension) {
    return null;
  }

  const [progression, currentStepNumber] = matchingProgression(
    dimensions,
    metadata,
  );

  if (!progression) {
    return null;
  }
  const nextStepNumber = currentStepNumber + 1;

  const table = metadata && firstDimension.field().table;
  const tableDimensions = columnsToFieldDimensions(table.fields, metadata);

  const allDimensions = [...dimensions, ...tableDimensions];

  const nextStep = progression[nextStepNumber];
  const newBreakouts = nextStep.applyToDimensions(allDimensions, metadata);
  if (!newBreakouts) {
    return null;
  }

  return newBreakouts.map(dimension => dimension.mbql());
}

/**
 * Returns the next drill down for the current dimension objects
 */
export function drillDownForDimensions(dimensions: any, metadata: any) {
  // const table = metadata && tableForDimensions(dimensions, metadata);

  const next = nextBreakouts(dimensions, metadata);
  if (!next) {
    return null;
  }

  return {
    breakouts: next,
  };
}

function columnsToFieldDimensions(columns, metadata) {
  return columns
    .map(column => columnToFieldDimension(column, metadata))
    .filter(Boolean);
}

function columnToFieldDimension(column, metadata) {
  if (isExpressionField(column.field_ref)) {
    return;
  }

  const dimension = new FieldDimension(column.id, null, metadata);

  if (column.unit) {
    return dimension.withTemporalUnit(column.unit);
  }

  if (column.binning_info) {
    const binningStrategy = column.binning_info.binning_strategy;
    switch (binningStrategy) {
      case "bin-width":
        return dimension.withBinningOptions({
          strategy: "bin-width",
          "bin-width": column.binning_info.bin_width,
        });
      case "num-bins":
        return dimension.withBinningOptions({
          strategy: "num-bins",
          "num-bins": column.binning_info.num_bins,
        });
    }
  }

  return dimension;
}
