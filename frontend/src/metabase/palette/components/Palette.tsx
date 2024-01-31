import styled from "@emotion/styled";
import { TextInput } from "metabase/ui";
import Modal from "metabase/components/Modal";

const PaletteModal = styled(Modal)`
  // Stolen from Github
  position: fixed;
  margin: 10vh auto;
  top: 0;
  z-index: 999;
  max-height: 80vh;
  max-width: 90vw;
  width: 448px;
  overflow: auto;
  box-shadow: rgba(15, 15, 15, 0.05) 0px 0px 0px 1px,
    rgba(15, 15, 15, 0.1) 0px 5px 10px, rgba(15, 15, 15, 0.2) 0px 15px 40px;
  border-radius: 0.25rem;
  min-height: 50vh;
  // max-height: max(50vh, 570px);
  padding: 1rem;

  // Is this useful? I got it from the palette on notion
  transform: translate3d(0px, 0px, 0px);
`;

const PaletteInput = styled(TextInput)``;

export const Palette = ({ closePalette }: { closePalette: () => void }) => {
  return (
    <>
      <PaletteModal onClose={closePalette}>
        <PaletteInput />
      </PaletteModal>
    </>
  );
};
