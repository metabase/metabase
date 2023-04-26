export interface RequestState {
  loading: boolean;
  loaded: boolean;
  fetched: boolean;
  error: any | null;
  _isRequestState: true;
}
