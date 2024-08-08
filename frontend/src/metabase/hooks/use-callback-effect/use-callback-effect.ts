import { useCallback, useEffect, useState } from "react";

type Callback = () => void | Promise<void>;

type IsScheduled = boolean;

export type ScheduleCallback = (callback: Callback) => void;

/**
 * Will schedule running a callback once after a re-render.
 */
export const useCallbackEffect = (): [IsScheduled, ScheduleCallback] => {
  const [callback, setCallback] = useState<Callback | null>(null);
  const isCallbackScheduled = callback !== null;

  /**
   * Schedule callback to run once after a re-render.
   */
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

  return [isCallbackScheduled, scheduleCallback];
};
