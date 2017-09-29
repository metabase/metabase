import { AsyncApi } from "metabase/services";

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
                console.error(error)
                dispatch.action(this.actions.requestFailed, { error })
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

    // Prefix for request Redux actions
    actionPrefix = null

    // Name of the request result property
    // In general, using the default value `result` is good for consistency
    // but using an existing prop name (like `xray` or `dashboard`) temporarily
    // can make the migration process from old implementation to this request API a lot easier
    resultPropName = 'result'

    pollingTimeoutId = null

    constructor({ creationEndpoint, actionPrefix, resultPropName } = {}) {
        this.creationEndpoint = creationEndpoint
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
    trigger = (params) => {
        return async (dispatch) => {
            dispatch.action(this.actions.requestStarted)

            try {
                const newJobId = await this._createNewJob(params)
                const result = await this._pollForResult(newJobId)
                dispatch.action(this.actions.requestSuccessful, { result })
            } catch(error) {
                console.error(error)
                dispatch.action(this.actions.requestFailed, { error })
            }
        }
    }

    _createNewJob = async (requestParams) => {
        return (await this.creationEndpoint(requestParams))["job-id"]
    }

    _pollForResult = (jobId) => {
        if (this.pollingTimeoutId) {
            clearTimeout(this.pollingTimeoutId);
        }

        return new Promise((resolve, reject) => {
            const poll = async () => {
                try {
                    const response = await AsyncApi.status({ jobId })

                    if (response.status === 'done') {
                        resolve(response.result)
                    } else if (response.status === 'result-not-available') {
                        // The job result has been deleted; this is an unexpected state as we just
                        // created the job so simply throw a descriptive error
                        reject(new ResultNoAvailableError())
                    } else {
                        this.pollingTimeoutId = setTimeout(poll, POLLING_INTERVAL)
                    }
                } catch (error) {
                    this.pollingTimeoutId = null
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

class ResultNoAvailableError extends Error {
    constructor() {
        super()
        this.message = "Background job result isn't available for an unknown reason"
    }
}
