import { SessionApi } from "metabase/services";

export const deleteSession = async () => {
  try {
    // -    await SessionApi.delete();
    return await SessionApi.slo();
  } catch (error) {
    if (error.status !== 404) {
      console.error("Problem clearing session", error);
    }
  }
};
