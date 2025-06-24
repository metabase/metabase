import { useMergedRef } from "@mantine/hooks";
import ReactCodeMirror, {
  type ReactCodeMirrorProps,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import cx from "classnames";
import { forwardRef, useRef } from "react";

import S from "./CodeMirror.module.css";
import { type HighlightRange, useHighlightRanges } from "./highlights";
import { type ExtensionOptions, useBasicSetup, useExtensions } from "./utils";

export type CodeMirrorProps = ReactCodeMirrorProps &
  ExtensionOptions & {
    highlightRanges?: HighlightRange[];
  };

export const CodeMirror = forwardRef(function CodeMirrorInner(
  props: CodeMirrorProps,
  ref: React.Ref<ReactCodeMirrorRef>,
) {
  const {
    className,
    basicSetup,
    highlightRanges,
    onFormat,
    autoFocus,
    autoCorrect,
    tabIndex,
    extensions,
    ...rest
  } = props;

  const extendedExtensions = useExtensions({
    extensions,
    onFormat,
    autoFocus,
    autoCorrect,
    tabIndex,
  });

  const localRef = useRef(null);
  const mergedRef = useMergedRef(localRef, ref);

  useHighlightRanges(localRef, highlightRanges);
  const setup = useBasicSetup(basicSetup);

  return (
    <ReactCodeMirror
      ref={mergedRef}
      {...rest}
      autoFocus={autoFocus}
      className={cx(S.editor, className)}
      basicSetup={setup}
      extensions={extendedExtensions}
    />
  );
});
