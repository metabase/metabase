import { useEffect, useLayoutEffect, useState } from "react";
import useFormState, { FormStatus } from "../use-form-state";

const STATUS_TIMEOUT = 5000;

const useFormStatus = (): FormStatus | undefined => {
  const { status } = useFormState();
  const isRecent = useIsRecent(status, STATUS_TIMEOUT);

  switch (status) {
    case "pending":
      return status;
    case "fulfilled":
    case "rejected":
      return isRecent ? status : undefined;
  }
};

function useIsRecent(value: unknown, timeout: number) {
  const [isRecent, setIsRecent] = useState(true);

  useEffect(() => {
    const timerId = setTimeout(() => setIsRecent(false), timeout);
    return () => clearTimeout(timerId);
  }, [value, timeout]);

  useLayoutEffect(() => {
    setIsRecent(true);
  }, [value]);

  return isRecent;
}

export default useFormStatus;
