export function getCurrentSpace ({ _spaces, params }) {
    return _spaces.spaces.filter(space =>
        space.slug === params.space
    )[0]
}

export function getMetricById ({ _spaces, params }) {
    return _spaces.metrics.filter(m => m.id.toString() === params.id)[0]
}

export function getDatabaseByID (state) {
    const { _spaces, params } = state
    return _spaces.databases.filter(d => d.id.toString() === params.id)[0]
}

export function getTableById (state) {
    const { _spaces, params } = state
    const table = _spaces.tables.filter(t => {
        return t.id.toString() === params.id
    })[0]
    return table
}

export function getMetricsForSpace (state) {
    return getEntityForSpace(state, 'metrics')
}

export function getDashboardsForSpace (state) {
    return getEntityForSpace(state,'dashboards')
}

export function getPulsesForSpace (state) {
    return getEntityForSpace(state, 'pulses')
}

export function getQuestionsForSpace (state) {
    return getEntityForSpace(state, 'questions')
}

export function getDatabasesForSpace (state) {
    return getEntityForSpace(state, 'databases')
}

export function getSegmentsForSpace (state) {
    return getEntityForSpace(state, 'segments')
}

export function getImportantSegmentsForSpace (state) {
    const segments = getSegmentsForSpace(state)
    return segments
}

export function getSegmentById (state) {
    return state._spaces.segments.filter(s => s.id.toString() === state.params.id)[0]
}

export function getTablesForDB (state) {
    const dbID = getDatabaseByID(state).id
    return state._spaces.tables.filter(t => {
        return t.db.id === dbID
    })
}

export function getDashboard ({ _spaces, params }) {
    return _spaces.dashboards.filter(d => {
        return d.id.toString() === params.id
    })[0]
}

export function getQuestion ({ _spaces, params }) {
    return _spaces.questions.filter(d => {
        return d.id.toString() === params.id
    })[0]
}

export function getLogsForSpace (state) {
    const space = getCurrentSpace(state)
    // reverse to most recent logs are first
    return state._spaces.log.filter(l => l.spaceId === space.id).reverse()
}

// get a given entity type given a space
export function getEntityForSpace (state, entityType) {
    const { _spaces, params } = state

    const currentSpace = getCurrentSpace(state)
    if (!currentSpace) {
      return;
    }
    // for the everything space
    if(currentSpace.global) {
        return _spaces[entityType]
    }

    console.log('GET entity', entityType)
    console.log('----------', _spaces[entityType])

    return _spaces[entityType].filter(e => {
        return e.spaces && e.spaces[0] === currentSpace.id
    })
}
