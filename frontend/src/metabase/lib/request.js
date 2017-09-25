export class RestfulRequest {
    // API endpoint that is used for the request
    endpoint = null

    // Prefix for request Redux actions
    actionPrefix = null

    // Name of the request result property
    // In general, using the default value `result` is good for consistency
    // but using an existing prop name (like `xray` or `dashboard`) temporarily
    // can make the migration process from old implementation to this request API a lot easier
    resultPropName = 'result'

    constructor({ endpoint, actionPrefix, resultPropName } = {}) {
        this.endpoint = endpoint
        this.actionPrefix = actionPrefix
        this.resultPropName = resultPropName || this.resultPropName

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
                const result = await this.endpoint(params)
                dispatch.action(this.actions.requestSuccessful, { result })
            } catch(error) {
                dispatch.action(this.actions.requestFailed, { error })
                throw error;
            }

        }

    reset = () => (dispatch) => dispatch(this.actions.reset)

    getReducers = () => ({
        [this.actions.requestStarted]: (state) => ({...state, loading: true}),
        [this.actions.requestSuccessful]: (state, { payload: { result }}) => ({
            ...state,
            [this.resultPropName]: result,
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
        [this.resultPropName]: null,
        loading: false,
        fetched: false,
        error: null
    })
}

const POLLING_INTERVAL = 100

export class BackgroundJobRequest {
    // API endpoint that creates a new background job
    creationEndpoint = null

    // API endpoint that tells the status for a given background job
    statusEndpoint = null

    // Prefix for request Redux actions
    actionPrefix = null

    // Name of the request result property
    // In general, using the default value `result` is good for consistency
    // but using an existing prop name (like `xray` or `dashboard`) temporarily
    // can make the migration process from old implementation to this request API a lot easier
    resultPropName = 'result'

    pollingTimeoutId = null

    constructor({ creationEndpoint, statusEndpoint, actionPrefix, resultPropName } = {}) {
        this.creationEndpoint = creationEndpoint
        this.statusEndpoint = statusEndpoint
        this.actionPrefix = actionPrefix
        this.resultPropName = resultPropName || this.resultPropName

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
            if (this.pollingTimeoutId) {
                clearTimeout(this.pollingTimeoutId);
            }

            dispatch.action(this.actions.requestStarted)

            let jobId = null
            try {
                jobId = (await this.creationEndpoint(params))["job-id"]
                // NOTE: Should successful triggering dispatch an action (for helping debugging)?
            } catch(error) {
                // NOTE: Should this have a separate action like `CREATE_BACKGROUND_JOB_FAILED`?
                dispatch.action(this.actions.requestFailed, { error })
                throw error;
            }

            return new Promise((resolve, reject) => {
                const poll = async () => {
                    try {
                        const response = await this.statusEndpoint({ jobId })

                        if (response.status === 'done') {
                            dispatch.action(this.actions.requestSuccessful, { result: response.result })
                        } else {
                            this.pollingTimeoutId = setTimeout(poll, POLLING_INTERVAL)
                        }
                    } catch (error) {
                        this.pollingTimeoutId = null
                        dispatch.action(this.actions.requestFailed, {error})
                        reject(error)
                    }
                }

                poll()
            })
        }

    reset = () => (dispatch) => dispatch(this.actions.reset)

    getReducers = () => ({
        [this.actions.requestStarted]: (state) => ({...state, loading: true}),
        [this.actions.requestSuccessful]: (state, { payload: { result }}) => ({
            ...state,
            [this.resultPropName]: result,
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
        [this.resultPropName]: null,
        loading: false,
        fetched: false,
        error: null
    })
}
