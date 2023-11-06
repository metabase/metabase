import { useState, useEffect } from "react";
import { autoUpdate } from "@floating-ui/react";
import { useDidUpdate } from "@mantine/hooks";
import type { FloatingPosition } from "../types";

interface Payload {
  opened: boolean;
  floating: {
    update(): void;
    refs: {
      floating: React.MutableRefObject<any>;
      reference: React.MutableRefObject<any>;
    };
  };
  positionDependencies: any[];
  position: FloatingPosition;
}

export function useFloatingAutoUpdate({
  opened,
  floating,
  position,
  positionDependencies,
}: Payload) {
  const [delayedUpdate, setDelayedUpdate] = useState(0);

  useEffect(() => {
    if (floating.refs.reference.current && floating.refs.floating.current) {
      return autoUpdate(
        floating.refs.reference.current,
        floating.refs.floating.current,
        floating.update,
      );
    }

    return undefined;
  }, [
    floating.refs.reference.current,
    floating.refs.floating.current,
    opened,
    delayedUpdate,
    position,
  ]);

  useDidUpdate(() => {
    floating.update();
  }, positionDependencies);

  useDidUpdate(() => {
    setDelayedUpdate(c => c + 1);
  }, [opened]);
}
