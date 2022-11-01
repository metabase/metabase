import { useState, useEffect, useRef } from "react";

export interface UseLoadGsiScriptOptions {
  /**
   * Callback fires on load [gsi](https://accounts.google.com/gsi/client) script success
   */
  onScriptLoadSuccess?: () => void;
  /**
   * Callback fires on load [gsi](https://accounts.google.com/gsi/client) script failure
   */
  onScriptLoadError?: () => void;
}

export default function useLoadGsiScript(
  options: UseLoadGsiScriptOptions = {},
): boolean {
  const { onScriptLoadSuccess, onScriptLoadError } = options;

  const [scriptLoadedSuccessfully, setScriptLoadedSuccessfully] =
    useState(false);

  const onScriptLoadSuccessRef = useRef(onScriptLoadSuccess);
  onScriptLoadSuccessRef.current = onScriptLoadSuccess;

  const onScriptLoadErrorRef = useRef(onScriptLoadError);
  onScriptLoadErrorRef.current = onScriptLoadError;

  useEffect(() => {
    const scriptTag = document.createElement("script");
    scriptTag.src = "https://accounts.google.com/gsi/client";
    scriptTag.async = true;
    scriptTag.defer = true;
    scriptTag.onload = () => {
      setScriptLoadedSuccessfully(true);
      onScriptLoadSuccessRef.current?.();
    };
    scriptTag.onerror = () => {
      setScriptLoadedSuccessfully(false);
      onScriptLoadErrorRef.current?.();
    };

    document.body.appendChild(scriptTag);

    return () => {
      document.body.removeChild(scriptTag);
    };
  }, []);

  return scriptLoadedSuccessfully;
}
