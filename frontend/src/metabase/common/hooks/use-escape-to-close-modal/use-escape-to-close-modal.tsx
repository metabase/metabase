import { useKey } from "react-use";

type Handler = (event?: KeyboardEvent) => void;

/*
  This hook is designed to be used in place of the `closeOnEscape` prop on some mantine modals.
  By default, the mantine modal prop will always capture the event, making it hard to override
  with other event handlers. This is especially tricky with the EntityPickerModal where it is
  generally the child of another modal (create collection / dashboard). By using this hook and
  applying the capture option where needed, we can control the order in which modals are
  dismissed when the user presses Escape.
*/

export const useEscapeToCloseModal = (
  handler: Handler,
  opts: AddEventListenerOptions = {},
) => {
  useKey(
    "Escape",
    (e) => {
      e.stopPropagation();
      handler(e);
    },
    { options: opts },
  );
};
