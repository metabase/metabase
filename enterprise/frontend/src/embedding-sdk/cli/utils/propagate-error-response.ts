// Propagate the error from the API to the CLI.
export const propagateErrorResponse = async (res: Response) => {
  if (res.ok) {
    return;
  }

  let errorText = await res.text();

  try {
    errorText = JSON.parse(errorText).message;
  } catch (err) {}

  throw new Error(errorText);
};
