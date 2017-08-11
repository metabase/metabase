export const getFieldXray = (state) =>
    state.xray.fieldXray && state.xray.fieldXray.features

export const getTableXray = (state) =>
    state.xray.tableXray && state.xray.tableXray.features

export const getSegmentXray = (state) =>
    state.xray.segmentXray && state.xray.segmentXray.features

export const getTableConstituents = (state) =>
    state.xray.tableXray && (
        Object.keys(state.xray.tableXray.constituents).map(key =>
            state.xray.tableXray.constituents[key]
        )
    )

export const getSegmentConstituents = (state) =>
    state.xray.segmentXray && (
        Object.keys(state.xray.segmentXray.constituents).map(key =>
            state.xray.segmentXray.constituents[key]
        )
    )

export const getComparison = (state) => state.xray.comparison

export const getComparisonFields = (state) => state.xray.comparison && (
    Object.keys(state.xray.comparison.constituents[0].constituents)
                     .map(key => {
                         return {
                             ...state.xray.comparison.constituents[0].constituents[key].field,
                             distance: state.xray.comparison.comparison[key].distance
                         }
                     })
)
