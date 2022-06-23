import React from "react";
import cx from "classnames";
import JsonEditor from "./JsonEditor/JsonEditor";

type Props = {
  contentType: string;
  setContentType: (contentType: string) => void;

  body: string;
  setBody: (contentType: string) => void;
};

const BodyTab: React.FC<Props> = props => {
  if (props.contentType === "application/json") {
    return <Json {...props} />;
  }

  return null;
};

const Json: React.FC<Props> = ({ body }) => {
  const content = React.useMemo(() => {
    try {
      const json = JSON.parse(body);
      if (typeof json === "object") {
        return { json };
      }
    } catch (e) {}
    return { json: {} };
  }, [body]);
  return (
    <JsonEditor
      navigationBar={false}
      mode="tree"
      onChangeMode={() => {}}
      content={content}
    />
  );
};

export default BodyTab;
