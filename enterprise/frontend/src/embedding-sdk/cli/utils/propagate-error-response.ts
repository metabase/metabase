// Propagate the error from the API to the CLI.
export const propagateErrorResponse = async (res: Response) => {
  if (res.ok) {
    return;
  }

  let errorText = await res.text();

  try {
    const error = JSON.parse(errorText);

    if (error.message) {
      errorText = error.message;
    }
  } catch (err) {}

  throw new Error(errorText);
};
