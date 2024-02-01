import { t } from "ttag";

import { useEffect, useMemo } from "react";
import { Icon } from "metabase/ui";
import EntityMenu from "metabase/components/EntityMenu";

import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";

import {
  registerPaletteAction,
  unregisterPaletteAction,
} from "metabase/redux/app";
import { useDispatch } from "metabase/lib/redux";
import { createPaletteAction } from "metabase/palette/utils";
import { IconContainer } from "./TextOptionsButton.styled";

interface TextOptionsButtonProps {
  onAddMarkdown: () => void;
  onAddHeading: () => void;
}

export function TextOptionsButton({
  onAddMarkdown,
  onAddHeading,
}: TextOptionsButtonProps) {
  const textOptions = useMemo(
    () => [
      {
        title: t`Heading`,
        paletteLabel: t`Add heading`,
        action: onAddHeading,
        event: "Dashboard; Add Heading",
      },
      {
        title: t`Text`,
        paletteLabel: t`Add text`,
        action: onAddMarkdown,
        event: "Dashboard; Add Markdown Box",
      },
    ],
    [onAddHeading, onAddMarkdown],
  );

  const dispatch = useDispatch();
  useEffect(() => {
    const paletteActions = textOptions.map(({ paletteLabel, action }) =>
      createPaletteAction({ children: paletteLabel, onClick: action }),
    );
    paletteActions.forEach(action => {
      dispatch(registerPaletteAction(action));
    });
    return () => {
      paletteActions.forEach(action => {
        dispatch(unregisterPaletteAction(action));
      });
    };
  }, [dispatch, textOptions]);

  return (
    <EntityMenu
      items={textOptions}
      trigger={
        <DashboardHeaderButton aria-label={t`Add a heading or text box`}>
          <IconContainer>
            <Icon name="string" size={18} />
            <Icon name="chevrondown" size={10} />
          </IconContainer>
        </DashboardHeaderButton>
      }
      minWidth={90}
    />
  );
}
