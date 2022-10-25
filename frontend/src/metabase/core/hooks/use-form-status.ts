import { useEffect, useLayoutEffect, useState } from "react";
import { useFormikContext } from "formik";

export type FormStatus = "normal" | "active" | "success" | "failed";

const STATUS_TIMEOUT = 5000;

const useFormStatus = (): FormStatus => {
  const { status, isSubmitting } = useFormikContext();
  const isRecent = useIsRecent(status?.status, STATUS_TIMEOUT);

  if (isSubmitting) {
    return "active";
  } else if (status?.status === "fulfilled" && isRecent) {
    return "success";
  } else if (status?.status === "rejected" && isRecent) {
    return "failed";
  } else {
    return "normal";
  }
};

const useIsRecent = (value: unknown, timeout: number) => {
  const [isRecent, setIsRecent] = useState(true);

  useEffect(() => {
    const timerId = setTimeout(() => setIsRecent(false), timeout);
    return () => clearTimeout(timerId);
  }, [value, timeout]);

  useLayoutEffect(() => {
    setIsRecent(true);
  }, [value]);

  return isRecent;
};

export default useFormStatus;
