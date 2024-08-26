import { useFormContext } from "metabase/forms";

import { useRecentlyTrue } from "./useRecentlyTrue";

/** NOTE: This uses useFormContext not useFormikContext */
export const useIsFormPending = (delay = 500) => {
  const { status } = useFormContext();
  const isFormPending = status === "pending";
  const [wasFormRecentlyPending] = useRecentlyTrue(isFormPending, delay);
  return { isFormPending, wasFormRecentlyPending };
};
