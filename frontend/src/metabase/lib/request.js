import _ from "underscore";
export class RestfulRequest {
  // API endpoint that is used for the request
  endpoint = null;

  // Prefix for request Redux actions
  actionPrefix = null;

  // Name of the request result property
  // In general, using the default value `result` is good for consistency
  // but using an existing prop name (like `dashboard`) temporarily
  // can make the migration process from old implementation to this request API a lot easier
  resultPropName = "result";

  // If `true`, then the result (either an object an array) will be converted to a dictionary
  // where the dictionary key is the `id` field of the result.
  // This dictionary is merged to the possibly pre-existing dictionary.
  storeAsDictionary = false;

  constructor({
    endpoint,
    actionPrefix,
    resultPropName,
    storeAsDictionary,
  } = {}) {
    this.endpoint = endpoint;
    this.actionPrefix = actionPrefix;
    this.resultPropName = resultPropName || this.resultPropName;
    this.storeAsDictionary = storeAsDictionary;

    this.actions = {
      requestStarted: `${this.actionPrefix}/REQUEST_STARTED`,
      requestSuccessful: `${this.actionPrefix}/REQUEST_SUCCESSFUL`,
      requestFailed: `${this.actionPrefix}/REQUEST_FAILED`,
      resetRequest: `${this.actionPrefix}/REQUEST_RESET`,
    };
  }

  // Triggers the request; modelled as a Redux thunk action so wrap this to `dispatch()` call
  trigger = params => async dispatch => {
    dispatch.action(this.actions.requestStarted);
    try {
      const result = await this.endpoint(params);
      dispatch.action(this.actions.requestSuccessful, { result });
    } catch (error) {
      dispatch.action(this.actions.requestFailed, { error });
      throw error;
    }
  };

  reset = () => dispatch => dispatch(this.actions.reset);

  mergeToDictionary = (dict, result) => {
    dict = dict || {};
    result = _.isArray(result)
      ? _.indexBy(result, "id")
      : { [result.id]: result };

    return { ...dict, ...result };
  };

  getReducers = () => ({
    [this.actions.requestStarted]: state => ({
      ...state,
      loading: true,
      error: null,
    }),
    [this.actions.requestSuccessful]: (state, { payload: { result } }) => ({
      ...state,
      [this.resultPropName]: this.storeAsDictionary
        ? this.mergeToDictionary(state[this.resultPropName], result)
        : result,
      loading: false,
      fetched: true,
      error: null,
    }),
    [this.actions.requestFailed]: (state, { payload: { error } }) => ({
      ...state,
      loading: false,
      error: error,
    }),
    [this.actions.resetRequest]: state => ({
      ...state,
      ...this.getDefaultState(),
    }),
  });

  getDefaultState = () => ({
    [this.resultPropName]: null,
    loading: false,
    fetched: false,
    error: null,
  });
}
