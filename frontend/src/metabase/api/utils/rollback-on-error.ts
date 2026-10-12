type Patch = {
  undo: () => void;
};

/** Undoes optimistic cache patches when the mutation they anticipated fails. */
export async function rollbackOnError(
  queryFulfilled: Promise<unknown>,
  patches: Patch[],
) {
  try {
    await queryFulfilled;
  } catch {
    patches.forEach((patch) => patch.undo());
  }
}
