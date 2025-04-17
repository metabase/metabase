import {
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
  autocompletion,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { ChangeSet, type ChangeSpec, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror, {
  type ReactCodeMirrorProps,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import cx from "classnames";
import React, { Fragment, useMemo, useRef, useState } from "react";

import type { CodeLanguage } from "metabase/components/CodeBlock/types";
import {
  getLanguageExtension,
  nonce,
} from "metabase/components/CodeBlock/utils";
import { isNotNull } from "metabase/lib/types";
import { Text } from "metabase/ui";

import S from "./TemplateEditor.module.css";

// Helper function to recursively find all leaf paths in an object
function getAllPaths(obj: any, currentPath = ""): string[] {
  let paths: string[] = [];
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return [];
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      const value = obj[key];

      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        value.constructor === Object
      ) {
        paths = paths.concat(getAllPaths(value, newPath));
      } else {
        paths.push(newPath);
      }
    }
  }
  return paths;
}

// Build a set of all possible paths for autocomplete from provided payload object.
const createTemplateAutocompleteSource = (
  context: Record<string, any>,
): CompletionSource => {
  const allSortedPaths = getAllPaths(context).sort();

  return (completionContext: CompletionContext): CompletionResult | null => {
    const word = completionContext.matchBefore(/{{\s*(?:[\w#-]+\s+)*([\w.]*)$/);

    if (!word || word.text.startsWith("{{/")) {
      return null;
    }

    const matchResult = word.text.match(/{{\s*(?:[\w#-]+\s+)*([\w.]*)$/);
    const pathPrefix = matchResult ? matchResult[1] : "";

    if (!matchResult) {
      return null;
    }

    const from = word.to - pathPrefix.length;

    const matchingPaths = allSortedPaths.filter((p) =>
      p.startsWith(pathPrefix),
    );

    if (matchingPaths.length === 0) {
      return null;
    }

    const options = matchingPaths.map((fullPath) => ({
      label: fullPath,
      apply: fullPath,
      type: "variable",
    }));

    return {
      from: from,
      to: word.to,
      options: options,
      filter: false,
    };
  };
};

export interface TemplateEditorProps
  extends Omit<
    ReactCodeMirrorProps,
    | "defaultValue"
    | "onChange"
    | "extensions"
    | "basicSetup"
    | "value"
    | "onBlur"
    | "minHeight"
  > {
  variant?: "textarea" | "textinput";
  language?: CodeLanguage;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (value: string) => void;
  minHeight?: string;
  placeholder?: string;
  templateContext?: Record<string, any>;
  error?: string | boolean;
}

// Transaction filter to prevent newlines entering in textinput variant.
// This imitates behavior of a regular single-line text input.
const preventNewlinesFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) {
    return tr;
  }

  const specs: ChangeSpec[] = [];
  let hasNewline = false;

  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    const text = inserted.toString();
    if (text.includes("\n")) {
      hasNewline = true;
      specs.push({ from: fromA, to: toA, insert: text.replace(/\n/g, "") });
    } else {
      specs.push({ from: fromA, to: toA, insert: text });
    }
  }, true);

  if (hasNewline) {
    const newChanges = ChangeSet.of(specs, tr.startState.doc.length);

    return {
      changes: newChanges,
      selection: tr.selection,
      filter: false,
    };
  }

  return tr;
});

export const TemplateEditor = ({
  defaultValue = "",
  onChange,
  minHeight = "5rem",
  language = "html",
  placeholder: propsPlaceholder,
  className,
  variant = "textarea",
  error,
  templateContext,
  onBlur,
  ...rest
}: TemplateEditorProps) => {
  const ref = useRef<ReactCodeMirrorRef>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);

  const handleChange = React.useCallback(
    (val: string) => {
      setInternalValue(val);
      if (onChange) {
        onChange(val);
      }
    },
    [onChange],
  );

  const blurEventHandlerExtension = useMemo(() => {
    return EditorView.updateListener.of((update) => {
      if (update.focusChanged && !update.view.hasFocus && onBlur) {
        const currentValue = update.state.doc.toString();
        onBlur(currentValue);
      }
    });
  }, [onBlur]);

  const templateAutocompleteExtension = useMemo(() => {
    return templateContext
      ? autocompletion({
          override: [createTemplateAutocompleteSource(templateContext)],
        })
      : [];
  }, [templateContext]);

  const combinedExtensions = useMemo(() => {
    return [
      blurEventHandlerExtension,
      nonce(),
      syntaxHighlighting(defaultHighlightStyle),
      variant === "textarea" ? EditorView.lineWrapping : null,
      getLanguageExtension(language),
      templateAutocompleteExtension,
      variant === "textinput" ? preventNewlinesFilter : null,
    ]
      .filter(isNotNull)
      .concat(keymap.of(completionKeymap))
      .flat();
  }, [
    language,
    blurEventHandlerExtension,
    templateAutocompleteExtension,
    variant,
  ]);

  const isTextArea = variant === "textarea";
  const isTextInput = variant === "textinput";

  return (
    <Fragment>
      <CodeMirror
        onClick={() => {
          if (ref.current && !ref.current.view?.hasFocus) {
            ref.current.view?.focus();
          }
        }}
        ref={ref}
        value={internalValue}
        onChange={handleChange}
        extensions={combinedExtensions}
        minHeight={isTextArea && minHeight ? minHeight : undefined}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          indentOnInput: false,
        }}
        className={cx(S.templateEditor, className, {
          [S.hasError]: error && typeof error === "string",
          [S.textInputVariant]: isTextInput,
        })}
        {...rest}
      />
      {typeof error === "string" && error && (
        <Text c="error" size="sm" mt="xs">
          {error}
        </Text>
      )}
    </Fragment>
  );
};
TemplateEditor.displayName = "TemplateEditor";
