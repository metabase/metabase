import type { IconName } from "metabase/ui";
import { Button, Flex } from "metabase/ui";
import {
  PaletteInput,
  PaletteItemDisplay,
  PaletteModal,
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
                <Button
                  onClick={() => {
                    run();
                  }}
                >
                  <PaletteResultIcon name={icon} />
                  {title}
                </Button>
              </Flex>
            </PaletteItemDisplay>
          ))}
        </ul>
      </PaletteModal>
    </>
  );
};
