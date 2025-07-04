import { useEffect } from "react";

import type { R2wcBaseProps } from "embedding-sdk/lib/web-components/r2wc/r2wc-core";

type Props = Pick<R2wcBaseProps, "container" | "slot">;

export const Slot = ({ container, slot }: Props) => {
  useEffect(
    () => {
      const event = new CustomEvent(`slot-${slot}-loaded`);
      // Listened in the `r2wc-core` class
      container.dispatchEvent(event);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
    [],
  );

  return <slot name={slot}></slot>;
};
