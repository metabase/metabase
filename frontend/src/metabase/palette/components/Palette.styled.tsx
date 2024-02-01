import styled from "@emotion/styled";
import CommandPalette from "react-cmdk";
import { Button, Icon, TextInput } from "metabase/ui";
import Modal from "metabase/components/Modal";

export const PaletteModal = styled(Modal)`
  // Stolen from Github
  position: fixed;
  margin: 10vh auto;
  top: 0;
  z-index: 999;
  max-height: 80vh;
  max-width: 90vw;
  width: 448px;
  overflow: auto;
  box-shadow: 0 1px 0.25rem 0 rgba(0, 0, 0, 0.06);
  border-radius: 0.25rem;
  min-height: 50vh;
  // max-height: max(50vh, 570px);
  padding: 1rem;
  display: flex;

  // Is this useful? I got it from the palette on notion
  transform: translate3d(0px, 0px, 0px);

  // fix later
  & .ModalBody {
    padding: 0;
  }
  button {
    display: flex;
    flex-flow: row nowrap;
  }
`;

export const PaletteStyled = styled(CommandPalette)`
  &,
  & * {
    font-family: unset !important;
    background: red;
  }
`;

export const StyledPaletteItem = styled(CommandPalette.ListItem)``;

export const PaletteItemDisplay = styled.li`
  list-style: none;
  display: flex;
  width: 100%;
  margin-bottom: 0.5rem;
  // fix later
  & button span {
    display: flex;
    align-items: center;
  }
`;

export const PaletteInput = styled(TextInput)``;

export const PaletteResultIcon = styled(Icon)`
  margin-right: 0.5rem;
`;

export const PaletteResultButton = styled(Button)`
  // fix later
`;

export const PaletteResultList = styled.ul`
  flex: 1;
  display: flex;
  align-items: stretch;
  flex-flow: column nowrap;
  margin-top: 1rem;
  padding: 0;
`;

export const PaletteModalContainer = styled.div`
  display: flex;
  flex-flow: column nowrap;
  flex: 1;
`;

CommandPalette.ListItem;
