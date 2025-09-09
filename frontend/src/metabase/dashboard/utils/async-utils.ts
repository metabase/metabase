export async function fetchDataOrError<T>(dataPromise: Promise<T>) {
  try {
    return await dataPromise;
  } catch (error) {
    return { error };
  }
}
