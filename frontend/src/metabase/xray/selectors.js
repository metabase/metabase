import { createSelector } from 'reselect'
import { normal } from 'metabase/lib/colors'

export const getLoadingStatus = (state) =>
    state.xray.loading

export const getError = (state) =>
    state.xray.error

export const getXray = (state) =>
    state.xray.xray

export const getFeatures = (state) =>
    state.xray.xray && state.xray.xray.features


export const getConstituents = createSelector(
    [getXray],
    (xray) => xray && Object.values(xray.constituents)
)

export const getComparison = (state) => state.xray.comparison

export const getComparisonFields = createSelector(
    [getComparison],
    (comparison) => {
        if(comparison) {
            return Object.keys(comparison.constituents[0].constituents)
                .map(key => {
                    return {
                        ...comparison.constituents[0].constituents[key].field,
                        distance: comparison.comparison[key].distance
                    }
                })
        }
    }
)

export const getComparisonContributors = createSelector(
    [getComparison],
    (comparison) => {
        if(comparison) {

            const getValue = (constituent, { field, feature }) => {
                return constituent.constituents[field][feature].value
            }

            const genContributor = ({ field, feature }) => ({
                field: comparison.constituents[0].constituents[field],
                feature: {
                    ...comparison.constituents[0].constituents[field][feature],
                    value: {
                        a: getValue(comparison.constituents[0], { field, feature }),
                        b: getValue(comparison.constituents[1], { field, feature })
                    },
                    type: feature
                }
            })

            const top = comparison['top-contributors']

            return top && top.map(genContributor)
        }
    }
)

export const getTitle = ({ comparison, itemA, itemB }) =>
    comparison && `${itemA.name} / ${itemB.name}`

const getItemColor = (index) => ({
    main: index === 0 ? normal.teal : normal.purple,
    text: index === 0 ? '#57C5DA' : normal.purple
})

const genItem = (item, itemType, index) => ({
    name: item.name,
    id: item.id,
    itemType,
    color: getItemColor(index),
})

export const getSegmentItem = (state, index = 0) => createSelector(
    [getComparison],
    (comparison) => {
        if(comparison) {
            const item = comparison.constituents[index].features.segment
            return {
                ...genItem(item, 'segment', index),
                constituents: comparison.constituents[index].constituents,
            }
        }
    }
)(state)

export const getTableItem = (state, index = 1) => createSelector(
    [getComparison],
    (comparison) => {
        if(comparison) {
            const item = comparison.constituents[index].features.table
            return {
                ...genItem(item, 'table', index),
                name: item.display_name,
                constituents: comparison.constituents[index].constituents,

            }
        }
    }
)(state)

// see if xrays are enabled. unfortunately enabled can equal null so its enabled if its not false
export const getXrayEnabled = state => {
    const enabled = state.settings.values && state.settings.values['enable_xrays']
    if(enabled == null || enabled == true) {
        return  true
    }
    return false
}

export const getMaxCost = state => state.settings.values['xray_max_cost']

