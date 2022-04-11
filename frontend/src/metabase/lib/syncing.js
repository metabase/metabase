export const isSyncInProgress = entity => {
  return entity.initial_sync_status === "incomplete";
};

export const isSyncCompleted = entity => {
  return entity.initial_sync_status === "complete";
};

export const isSyncAborted = entity => {
  return entity.initial_sync_status === "aborted";
};
