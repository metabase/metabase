import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import type { Undo } from "metabase-types/store/undo";

export const useToast = () => {
  const dispatch = useDispatch();

  const triggerToast = (
    message: Undo["message"],
    options: Partial<Omit<Undo, "message">> = {},
  ) => {
    dispatch(addUndo({ message, ...options }));
  };

  return { triggerToast };
};
