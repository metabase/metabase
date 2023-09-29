import { useCallback, useEffect, useState } from "react";

type Callback = () => void | Promise<void>;

/**
 * Will run callback once after a re-render.
 */
export const useCallbackEffect = () => {
  const [callback, setCallback] = useState<Callback | null>(null);
  const isScheduled = callback !== null;

  const scheduleCallback = useCallback((callback: Callback) => {
    setCallback(state => {
      if (state !== null) {
        throw new Error("A callback is already scheduled");
      }

      return callback;
    });
  }, []);

  useEffect(() => {
    const runCallbackOnce = async () => {
      if (callback) {
        await callback();
        setCallback(null);
      }
    };

    runCallbackOnce();
  }, [callback]);

  return [isScheduled, scheduleCallback];
};
