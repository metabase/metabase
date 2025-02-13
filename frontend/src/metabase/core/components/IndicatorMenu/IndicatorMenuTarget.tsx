import { type PropsWithChildren, useContext } from "react";

import { Indicator, Menu } from "metabase/ui";

import { IndicatorMenuContext } from "./IndicatorMenuContext";

export const IndicatorMenuTarget = (props: PropsWithChildren) => {
  const ctx = useContext(IndicatorMenuContext);

  if (!ctx) {
    throw new Error(
      "Indicator Menu Target must be used within an Indicator Menu",
    );
  }

  const { showIndicator } = ctx;

  return (
    <Menu.Target>
      <Indicator
        data-show-indicator={showIndicator}
        data-testid="menu-indicator-root"
        disabled={!showIndicator}
        size={6}
      >
        {props.children}
      </Indicator>
    </Menu.Target>
  );
};
