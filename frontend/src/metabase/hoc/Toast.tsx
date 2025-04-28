import type { ComponentType } from "react";

import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import type { Undo } from "metabase-types/store/undo";

export interface WithToasterReturned {
  triggerToast: (
    message: Undo["message"],
    options: Partial<Omit<Undo, "message">>,
  ) => void;
}
function withToaster<P>(
  ComposedComponent: ComponentType<P & WithToasterReturned>,
) {
  type ToastedComponentProps = P;

  const ToastedComponentInternal = (props: ToastedComponentProps) => {
    const dispatch = useDispatch();

    const triggerToast = (
      message: Undo["message"],
      options: Partial<Omit<Undo, "message">> = {},
    ) => {
      dispatch(addUndo({ message, ...options }));
    };

    return <ComposedComponent triggerToast={triggerToast} {...props} />;
  };

  const displayName =
    ComposedComponent.displayName || ComposedComponent.name || "Component";
  ToastedComponentInternal.displayName = `WithToaster(${displayName})`;

  return ToastedComponentInternal;
}

// eslint-disable-next-line import/no-default-export
export default withToaster;
