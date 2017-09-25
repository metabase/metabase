
export class RestfulRequest {
    endpoint = null
    entityName = 'result'
    actionPrefix = null

    constructor({ endpoint, entityName, actionPrefix } = {}) {
        this.endpoint = endpoint
        this.entityName = entityName || this.entityName
        this.actionPrefix = actionPrefix

        this.actions = {
            requestStarted: `${this.actionPrefix}/REQUEST_STARTED`,
            requestSuccessful: `${this.actionPrefix}/REQUEST_SUCCESSFUL`,
            requestFailed: `${this.actionPrefix}/REQUEST_FAILED`,
            resetRequest: `${this.actionPrefix}/REQUEST_RESET`
        }
    }

    // Triggers the request; modelled as a Redux thunk action so wrap this to `dispatch()` call
    trigger = (params) =>
        async (dispatch) => {
            dispatch.action(this.actions.requestStarted)
            try {
                const response = await this.endpoint(params)
                dispatch.action(this.actions.requestSuccessful, { response })
            } catch(error) {
                dispatch.action(this.actions.requestFailed, { error })
                throw error;
            }

        }

    reset = () => (dispatch) => dispatch(this.actions.reset)

    getReducers = () => ({
        [this.actions.requestStarted]: (state) => ({...state, loading: true}),
        [this.actions.requestSuccessful]: (state, { payload: { response }}) => ({
            ...state,
            [this.entityName]: response,
            loading: false,
            fetched: true
        }),
        [this.actions.requestFailed]: (state, { payload: { error } }) => ({
            ...state,
            loading: false,
            error: error
        }),
        [this.actions.resetRequest]: (state) => ({ ...state, ...this.getDefaultState() })
    })

    getDefaultState = () => ({
        [this.entityName]: null,
        loading: false,
        fetched: false,
        error: null
    })
}

// RestfulRequest for conventional REST API endpoints
// const tableXrayRequest = new RestfulRequest({
//     endpoint: XRayApi.table_xray,
//     // What will be the name of entity
//     entityName: 'xray',
//     // How REQUEST_STARTED, REQUEST_FAILED and REQUEST_SUCCESSFUL should be prefixed in action names?
//     actionPrefix: 'metabase/xray'
// })

// ComputationRequest for computations with status polling
// const tableXrayRequest = new ComputationRequest({
//     triggerEndpoint: XRayApi.async_table_xray,
//     statusEndpoint: XRayApi.async_status,
//     entityName: 'xray',
//     actionPrefix: 'metabase/xray'
// })

