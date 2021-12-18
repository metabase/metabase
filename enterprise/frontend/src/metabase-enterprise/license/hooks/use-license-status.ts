import { useEffect, useState } from "react";
import { t } from "ttag";
import { StoreApi } from "../services";

export const useLicenseStatus = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isValid, setIsValid] = useState<boolean>();

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await StoreApi.tokenStatus();
        setIsValid(status.valid);
      } catch {
        setIsValid(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, []);

  return {
    isValid,
    isLoading,
  };
};
