import { KBarContext } from "kbar";
import { useContext, useEffect } from "react";

interface Props {
  disabled: boolean;
}

export const useDisableCommandPalette = ({ disabled }: Props) => {
  const context = useContext(KBarContext);

  useEffect(() => {
    // If there is no context, do nothing
    if (!context?.query) {
      return;
    }

    const { query, getState } = context;

    // Check to see if the command palette is already disabled. this is important
    // for nested modal scenarios where a child can re-enable the palette when
    // it is unmounted
    const alreadyDisabled = getState().disabled;
    if (alreadyDisabled) {
      return;
    }

    // Otherwise, disable the palette while the modal is open
    if (disabled) {
      query.disable(true);

      return () => query.disable(false);
    }
  }, [context, disabled]);

  return null;
};
