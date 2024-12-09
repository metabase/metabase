import type { CliError } from "../types/cli";

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

export function cliError(title: string, error: unknown): CliError {
  const reason = error instanceof Error ? error.message : String(error);
  const message = `${title}. Reason: ${reason}`;

  return { type: "error", message };
}
