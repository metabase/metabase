import { useEffect, useRef, useCallback } from "react";
import Tether from "tether";
import _ from "underscore";

import { useForceUpdate } from "metabase/hooks/use-force-update";

function getTetherContainer() {
  let tetherContainerEl = document.body.querySelector(".tether");
  if (!tetherContainerEl) {
    tetherContainerEl = document.createElement("div");
    tetherContainerEl.className = "tether";
    document.body.appendChild(tetherContainerEl);
  }

  return tetherContainerEl;
}

export function useTether({
  tetherOptions,
  onRepositioned,
}: {
  tetherOptions: Tether.ITetherOptions;
  onRepositioned?: () => void;
}) {
  const popoverElRef = useRef<HTMLDivElement>();
  const tetherRef = useRef<Tether>();

  const forceUpdate = useForceUpdate();

  const doTether = useCallback(
    targetEl => {
      if (!targetEl) {
        return null;
      }

      if (!popoverElRef.current) {
        const popoverEl = document.createElement("div");
        const containerEl = getTetherContainer();
        containerEl.appendChild(popoverEl);
        popoverElRef.current = popoverEl;
        forceUpdate();
      }

      if (tetherRef.current) {
        tetherRef.current.setOptions({
          element: popoverElRef.current,
          target: targetEl,
          ...tetherOptions,
        });
      } else {
        const tether = new Tether({
          element: popoverElRef.current,
          target: targetEl,
          ...tetherOptions,
        });

        tetherRef.current = tether;
      }

      tetherRef.current.position();
    },
    [forceUpdate, tetherOptions],
  );

  useEffect(() => {
    if (!_.isFunction(onRepositioned)) {
      return;
    }

    const throttledOnRepositioned = _.throttle(e => {
      onRepositioned(e);
    }, 500);

    if (tetherRef.current) {
      tetherRef.current.on("repositioned", throttledOnRepositioned);
    }

    () => {
      if (tetherRef.current) {
        tetherRef.current.off("repositioned", throttledOnRepositioned);
      }
    };
  }, [onRepositioned]);

  useEffect(() => {
    return () => {
      console.log("destroying");
      if (popoverElRef.current) {
        popoverElRef.current.remove();
      }

      if (tetherRef.current) {
        tetherRef.current.destroy();
      }
    };
  }, []);

  return {
    runTether: doTether,
    containerEl: popoverElRef.current,
  };
}
