import { useState, useEffect, useRef, useCallback } from "react";
import Tether from "tether";
import _ from "underscore";

// for whatever reasion these properties aren't defined on `Tether`, but they do in fact exist
export interface TetherInstance extends Tether {
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;
}

// appending elements directly to the body can be unperformant
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
  onRepositioned?: (tether: TetherInstance) => void;
}) {
  // const popoverElRef = useRef<HTMLDivElement>();
  const tetherRef = useRef<TetherInstance>();
  const [popoverEl, setPopoverEl] = useState<HTMLDivElement>();

  const runTether = useCallback(
    (targetEl: HTMLElement) => {
      if (!targetEl) {
        return;
      }

      let element = popoverEl;
      if (!element) {
        element = document.createElement("div");
        const containerEl = getTetherContainer();
        containerEl.appendChild(element);
        setPopoverEl(element);
      }

      if (tetherRef.current) {
        tetherRef.current.setOptions({
          element,
          target: targetEl,
          ...tetherOptions,
        });
      } else {
        const tether = new Tether({
          element,
          target: targetEl,
          ...tetherOptions,
        }) as TetherInstance;

        tetherRef.current = tether;
      }

      // immediately force tether to position itself, because it doesn't always seem to do it
      tetherRef.current.position();
    },
    [popoverEl, tetherOptions],
  );

  useEffect(() => {
    if (!_.isFunction(onRepositioned)) {
      return;
    }

    const throttledOnRepositioned = _.throttle(() => {
      tetherRef.current && onRepositioned(tetherRef.current);
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
      if (popoverEl) {
        popoverEl.remove();
      }

      if (tetherRef.current) {
        tetherRef.current.destroy();
      }
    };
  }, [popoverEl]);

  return {
    // this function needs to run as soon as the target element is rendered, so apply it as a ref on the target element
    runTether,
    containerEl: popoverEl,
  };
}
