import { useKey } from "react-use";

type Handler = (event?: KeyboardEvent) => void;

export const useEscapeToCloseModal = (
  handler: Handler,
  opts: AddEventListenerOptions = {},
) => {
  useKey(
    "Escape",
    e => {
      e.stopPropagation();
      handler(e);
    },
    { options: opts },
  );
};
