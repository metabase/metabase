import type { IconName } from "metabase/ui";
import { Flex } from "metabase/ui";
import {
  PaletteInput,
  PaletteItemDisplay,
  PaletteModal,
  PaletteResultButton,
  PaletteResultIcon,
} from "./Palette.styled";

export type PaletteItem = {
  title: string;
  icon: IconName;
  run: () => void;
};

export const Palette = ({ closePalette }: { closePalette: () => void }) => {
  const items: PaletteItem[] = [
    {
      title: "Create new dashboard",
      icon: "dashboard",
      run: () => {
        alert("run");
      },
    },
  ];
  return (
    <>
      <PaletteModal onClose={closePalette}>
        <PaletteInput />
        <ul>
          {items.map(({ title, icon, run }) => (
            <PaletteItemDisplay key={title}>
              <Flex>
                <PaletteResultButton
                  onClick={() => {
                    run();
                  }}
                >
                  <PaletteResultIcon name={icon} />
                  {title}
                </PaletteResultButton>
              </Flex>
            </PaletteItemDisplay>
          ))}
        </ul>
      </PaletteModal>
    </>
  );
};
