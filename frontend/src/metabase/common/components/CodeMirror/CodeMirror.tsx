import { useMergedRef } from "@mantine/hooks";
import ReactCodeMirror, {
  type Extension,
  type ReactCodeMirrorProps,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import cx from "classnames";
import { type Ref, forwardRef, useRef } from "react";

import S from "./CodeMirror.module.css";
import { type HighlightRange, useHighlightRanges } from "./highlights";
import { getBasicSetup, useExtensions } from "./util";

export type CodeMirrorProps = ReactCodeMirrorProps & {
  onFormat?: () => void;
  extensions?: (Extension | null)[];
  highlightRanges?: HighlightRange[];
};

export const CodeMirror = forwardRef(function CodeMirrorInner(
  props: CodeMirrorProps,
  ref: Ref<ReactCodeMirrorRef>,
) {
  const { className, basicSetup, highlightRanges, onFormat, ...rest } = props;

  const extensions = useExtensions({
    extensions: props.extensions,
    onFormat,
  });

  const localRef = useRef(null);
  const mergedRef = useMergedRef(localRef, ref);

  useHighlightRanges(localRef, highlightRanges);

  return (
    <ReactCodeMirror
      ref={mergedRef}
      {...rest}
      className={cx(S.editor, className)}
      basicSetup={getBasicSetup(basicSetup)}
      extensions={extensions}
    />
  );
});
