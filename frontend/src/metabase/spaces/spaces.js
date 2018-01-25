import _ from 'underscore'
import {
    DASHBOARDS,
    PULSES,
    SPACES,
} from './fixtures'

import { METRICS } from './metric-fixtures'
import { SEGMENTS } from './segment-fixtures'
import { QUESTIONS } from './question-fixtures'
import { DATA } from './data-fixtures'

const dbRaw = DATA.map(d => d.db)

const DATABASES = _.uniq(dbRaw, 'id')

// [[DBID, [SPACE IDs]]
const DB_TO_SPACE = [
    [13, []], // GA
    [6, [5]], // Crunch
    [12, []], // App
    [11, []], // Magento
    [10, []], // CI REdj
    [17, [3]], // Build stats
    [5, [5]], // Cat
    [9, [3]], // Druid
    [2, [2, 3]], // MB downloads
    [4, [2, 3]], // Static assets
    [8, [5]], // Baseball
    [19, [4]], // Horror show
    [1, [5]], // Sample
]

// ----------------------------------------------------------------------------
// ACTIONS
// ----------------------------------------------------------------------------
export const PIN_ITEM = 'space/management/PIN_ITEM'

// Pin an item to the getting started guide of a space
export function pinItem(spaceId, itemType, item) {
    // can spaceID be derived from current space somewhere in the store?
    return {
        type: PIN_ITEM,
        payload: {
            itemType,
            item,
            spaceId
        }
    }
}

export const LOG_ITEM = 'space/view/LOG_ITEM'

export function logItem(spaceId, item, itemType) {
    return {
        type: LOG_ITEM,
        payload: {
            spaceId,
            item,
            itemType,
        }
    }
}

// ----------------------------------------------------------------------------
// STATE
// ----------------------------------------------------------------------------

export const DEFAULT_STATE = {
    spaces: SPACES,
    metrics: METRICS,
    segments: SEGMENTS,
    dashboards: DASHBOARDS,
    pulses: PULSES,
    questions: QUESTIONS,
    tables: DATA,
    log: [],
    databases: DATABASES
}

// main logic reducer
export default function appReducer(state = DEFAULT_STATE, action) {
    switch(action.type) {
        case PIN_ITEM:
            const up =  Object.assign({}, state, {
                spaces: state.spaces.map((s) => {
                    if(s.id !== action.payload.spaceId) {
                        return s
                    }
                    return Object.assign({}, s, {
                        pins: [
                            ...s.pins,
                            s.pins[`${action.payload.itemType}s`].concat([action.payload.item.id])
                        ]
                    })
                })
            })
            console.log(up)
            return up
        case LOG_ITEM:
            return Object.assign({}, state, {
                log: state.log.concat([action.payload])
            })
        default:
            return state
    }
}
