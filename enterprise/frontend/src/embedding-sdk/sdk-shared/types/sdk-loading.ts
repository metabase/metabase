export enum SdkLoadingError {
  NotStartedLoading = "NotStartedLoading",
  Error = "Error",
}

export enum SdkLoadingState {
  Initial = 0,
  Loading = 1,
  Loaded = 2,
  Initialized = 3,
}
