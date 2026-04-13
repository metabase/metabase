type EntityKey = string;

type QueryKey = string;

type RequestType = string; // only "fetch"?

// See initialRequestState in metabase/redux/requests.js
export interface RequestState {
  loading: boolean;
  loaded: boolean;
  fetched: boolean;
  error: unknown | null;
  _isRequestState: true;
}

type RequestsGroupState = Record<
  EntityKey,
  Record<QueryKey, Record<RequestType, RequestState>>
>;

export type RequestsState = {
  plugins: RequestsGroupState;
  entities: RequestsGroupState;
};
