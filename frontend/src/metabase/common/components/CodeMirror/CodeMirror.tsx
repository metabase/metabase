import ReactCodeMirror, {
  type Extension,
  type ReactCodeMirrorProps,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import { type Ref, forwardRef } from "react";

import { getBasicSetup, useExtensions } from "./util";

export type CodeMirrorProps = ReactCodeMirrorProps & {
  onFormat?: () => void;
  extensions?: (Extension | null)[];
};

export const CodeMirror = forwardRef(function CodeMirrorInner(
  props: CodeMirrorProps,
  ref: Ref<ReactCodeMirrorRef>,
) {
  const { basicSetup, ...rest } = props;

  const extensions = useExtensions({
    extensions: props.extensions,
    onFormat: props.onFormat,
  });

  return (
    <ReactCodeMirror
      ref={ref}
      {...rest}
      basicSetup={getBasicSetup(basicSetup)}
      extensions={extensions}
    />
  );
});
