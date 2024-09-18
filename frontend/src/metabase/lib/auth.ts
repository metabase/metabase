import { SessionApi } from "metabase/services";

export const deleteSession = async () => {
  try {
    await SessionApi.delete();
  } catch (error: any) {
    if (error.status !== 404) {
      console.error("Problem clearing session", error);
    }
  }
};

export const initiateSLO = async () => {
  try {
    return await SessionApi.slo();
  } catch (error: any) {
    if (error.status !== 404) {
      console.error("Problem clearing session", error);
    }
  }
};
