
export const getFieldXray = (state) =>
    state.xray.fieldXray && state.xray.fieldXray.thumbprint

export const getTableXray = (state) =>
    state.xray.tableXray && state.xray.tableXray.thumbprint

export const getSegmentXray = (state) =>
    state.xray.segmentXray && state.xray.segmentXray.thumbprint

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
