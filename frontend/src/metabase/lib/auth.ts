import { SessionApi } from "metabase/services";

interface ApiError {
  status?: number;
}

function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error
  );
}

export const deleteSession = async (): Promise<void> => {
  try {
    await SessionApi.delete();
  } catch (error) {
    if (isApiError(error) && error.status !== 404) {
      console.error("Problem clearing session", error);
    }
  }
};

export const initiateSLO = async (): Promise<void> => {
  try {
    return await SessionApi.slo();
  } catch (error) {
    if (isApiError(error) && error.status !== 404) {
      console.error("Problem clearing session", error);
    }
  }
};
