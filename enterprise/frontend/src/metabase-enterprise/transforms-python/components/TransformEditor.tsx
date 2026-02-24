import type {
  JavaScriptTransformEditorProps,
  PythonTransformEditorProps,
  TransformEditorProps,
} from "metabase/plugins";

import { PythonTransformEditor } from "./PythonTransformEditor";

export function TransformEditor(props: TransformEditorProps) {
  if (isPythonTransformEditorProps(props)) {
    return (
      <PythonTransformEditor
        source={props.source}
        proposedSource={props.proposedSource}
        uiOptions={props.uiOptions}
        isEditMode={props.isEditMode}
        transform={props.transform}
        onChangeSource={props.onChangeSource}
        onAcceptProposed={props.onAcceptProposed}
        onRejectProposed={props.onRejectProposed}
      />
    );
  } else if (isJavaScriptTransformEditorProps(props)) {
    return <JavaScriptTransformEditor {...props} />;
  }
  return null;
}

function isPythonTransformEditorProps(
  props: TransformEditorProps,
): props is PythonTransformEditorProps {
  return props.source.type === "python";
}

function isJavaScriptTransformEditorProps(
  props: TransformEditorProps,
): props is JavaScriptTransformEditorProps {
  return props.source.type === "javascript";
}
