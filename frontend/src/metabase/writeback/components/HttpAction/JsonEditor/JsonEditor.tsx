import React from "react";

import {
  JSONEditor,
  // eslint-disable-next-line import/named
  JSONEditorPropsOptional,
} from "svelte-jsoneditor/dist/jsoneditor.js";
import { Container } from "./JsonEditor.styled";

type Props = JSONEditorPropsOptional;

const JsonEditor: React.FC<Props> = (props: Props) => {
  const refContainer = React.useRef(null);
  const refEditor = React.useRef<JSONEditor | null>(null);

  React.useEffect(() => {
    // create editor
    // console.log("create editor", refContainer.current, props);
    refEditor.current = new (JSONEditor as any)({
      target: refContainer.current,
      props,
    });

    return () => {
      // destroy editor
      if (refEditor.current) {
        // console.log("destroy editor");
        refEditor.current.destroy();
        refEditor.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update props
  React.useEffect(() => {
    if (refEditor.current) {
      // console.log("update props", props);
      refEditor.current.updateProps(props);
    }
  }, [props]);

  return (
    <Container
      className="full-height svelte-jsoneditor-react"
      ref={refContainer}
    ></Container>
  );
};

export default JsonEditor;
