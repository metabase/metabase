import ErrorBoundary from "metabase/ErrorBoundary";

import { EntityPickerProvider } from "../context";
import type { EntityPickerProps } from "../types";

import { ButtonBar } from "./ButtonBar";
import { NestedItemPicker } from "./NestedItemPicker";

export function EntityPicker(props: EntityPickerProps) {
  return (
    <EntityPickerProvider value={props}>
      <ErrorBoundary>
        <NestedItemPicker />
      </ErrorBoundary>
      {props.options.hasConfirmButtons && (
        <ButtonBar
          onConfirm={props.onChange}
          onCancel={props.onClose}
          confirmButtonText={props.options.confirmButtonText}
          cancelButtonText={props.options.cancelButtonText}
        />
      )}
    </EntityPickerProvider>
  );
}
