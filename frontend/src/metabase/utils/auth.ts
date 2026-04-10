import { SessionApi } from "metabase/services";
import { isResourceNotFoundError } from "metabase/utils/errors/messages";

export const deleteSession = async () => {
  try {
    await SessionApi.delete();
  } catch (error) {
    if (!isResourceNotFoundError(error)) {
      console.error("Problem clearing session", error);
    }
  }
};

export const initiateSLO = async () => {
  try {
    return await SessionApi.slo();
  } catch (error) {
    if (!isResourceNotFoundError(error)) {
      console.error("Problem clearing session", error);
    }
  }
};
