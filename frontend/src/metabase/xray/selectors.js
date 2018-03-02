import { createSelector } from "reselect";
import { normal } from "metabase/lib/colors";

export const getLoadingStatus = state => state.xray.loading;

export const getIsAlreadyFetched = state => state.xray.fetched;

export const getError = state => state.xray.error;

export const getXray = state => state.xray.xray;

export const getFeatures = state => state.xray.xray && state.xray.xray.features;

export const getComparables = state =>
  state.xray.xray && state.xray.xray.comparables;

export const getConstituents = createSelector(
  [getXray],
  xray => xray && Object.values(xray.constituents),
);

export const getComparison = state => state.xray.comparison;

export const getComparisonFields = createSelector(
  [getComparison],
  comparison => {
    if (comparison) {
      return Object.keys(comparison.constituents[0].constituents).map(key => {
        return {
          ...comparison.constituents[0].constituents[key].model,
          distance: comparison.comparison[key].distance,
        };
      });
    }
  },
);

export const getComparisonContributors = createSelector(
  [getComparison],
  comparison => {
    if (comparison) {
      const getValue = (constituent, { field, feature }) => {
        return (
          constituent.constituents[field][feature] &&
          constituent.constituents[field][feature].value
        );
      };

      const genContributor = ({ field, feature }) => {
        const featureValue = {
          a: getValue(comparison.constituents[0], { field, feature }),
          b: getValue(comparison.constituents[1], { field, feature }),
        };

        if (featureValue.a !== null && featureValue.b !== null) {
          return {
            field: comparison.constituents[0].constituents[field],
            feature: {
              ...comparison.constituents[0].constituents[field][feature],
              value: featureValue,
              type: feature,
            },
          };
        } else {
          // NOTE Atte Keinänen: This will become obsolete
          return null;
        }
      };

      const top = comparison["top-contributors"];

      return (
        top &&
        top.map(genContributor).filter(contributor => contributor !== null)
      );
    }
  },
);

export const getTitle = ({ comparison, itemA, itemB }) =>
  comparison && `${itemA.name} / ${itemB.name}`;

const getItemColor = index => ({
  main: index === 0 ? normal.teal : normal.purple,
  text: index === 0 ? "#57C5DA" : normal.purple,
});

const genItem = (item, index) => ({
  name: item.name,
  id: item.id,
  "type-tag": item["type-tag"],
  color: getItemColor(index),
});

export const getModelItem = (state, index = 0) =>
  createSelector([getComparison], comparison => {
    if (comparison) {
      const item = comparison.constituents[index].features.model;
      return {
        ...genItem(item, index),
        constituents: comparison.constituents[index].constituents,
      };
    }
  })(state);

export const getSegmentItem = (state, index = 0) =>
  createSelector([getComparison], comparison => {
    if (comparison) {
      const item = comparison.constituents[index].features.segment;
      return {
        ...genItem(item, index),
        constituents: comparison.constituents[index].constituents,
      };
    }
  })(state);

export const getTableItem = (state, index = 1) =>
  createSelector([getComparison], comparison => {
    if (comparison) {
      const item = comparison.constituents[index].features.table;
      return {
        ...genItem(item, index),
        name: item.display_name,
        constituents: comparison.constituents[index].constituents,
      };
    }
  })(state);

// see if xrays are enabled. unfortunately enabled can equal null so its enabled if its not false
export const getXrayEnabled = state => {
  const enabled =
    state.settings.values && state.settings.values["enable_xrays"];
  if (enabled == null || enabled == true) {
    return true;
  }
  return false;
};

export const getMaxCost = state => state.settings.values["xray_max_cost"];
