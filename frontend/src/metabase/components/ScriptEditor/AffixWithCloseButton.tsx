import { type PaperProps, Transition, Paper } from "metabase/ui";
import { Affix, AffixProps, CloseButton, PaperProps } from "@mantine/core";
import { Dispatch, ReactNode, SetStateAction } from "react";

export const AffixWithCloseButton = ({
  onClose,
  children,
  affixProps,
  paperProps,
}: {
  onClose: () => void;
  children: ReactNode;
  affixProps: AffixProps;
  paperProps: PaperProps;
}) => {
  return (
    <Affix {...affixProps}>
      <Transition mounted transition="slide-up">
        {transitionStyles => (
          <Paper
            bd="1px solid rgba(0,0,0,.1)"
            p="0"
            style={transitionStyles}
            pos="relative"
            {...paperProps}
          >
            <CloseButton
              onClick={onClose}
              pos="absolute"
              right=".5rem"
              top=".65rem"
              style={{ color: "rgba(0, 0, 0, .7)", zIndex: 9999 }}
            />
            {children}
          </Paper>
        )}
      </Transition>
    </Affix>
  );
};
