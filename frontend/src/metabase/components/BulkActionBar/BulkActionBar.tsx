import type * as React from "react";

import { Transition } from "metabase/ui";

import { FixedBottomBar } from "./BulkActionBar.styled";

const slideIn = {
  in: { opacity: 1, transform: "translateY(0)" },
  out: { opacity: 0, transform: "translateY(100px)" },
  common: { transformOrigin: "top" },
  transitionProperty: "transform, opacity",
};

interface BulkActionBarProps {
  children: React.ReactNode;
  showing: boolean;
  isNavbarOpen: boolean;
}

export const BulkActionBar = ({
  children,
  showing,
  isNavbarOpen,
}: BulkActionBarProps) => (
  <Transition
    mounted={showing}
    transition={slideIn}
    duration={400}
    timingFunction="ease"
  >
    {styles => (
      <FixedBottomBar
        data-testid="bulk-action-bar"
        isNavbarOpen={isNavbarOpen}
        style={styles}
      >
        {children}
      </FixedBottomBar>
    )}
  </Transition>
);
