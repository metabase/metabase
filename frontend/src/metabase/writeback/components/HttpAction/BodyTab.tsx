import React from "react";
import _ from "underscore";

import JsonEditor from "./JsonEditor/JsonEditor";

type Props = {
  contentType: string;
  setContentType: (contentType: string) => void;

  body: string;
  setBody: (contentType: string) => void;
};

const BodyTab: React.FC<Props> = (props: Props) => {
  if (props.contentType === "application/json") {
    return <Json {...props} />;
  }

  return null;
};

const Json: React.FC<Props> = ({ body, setBody }: Props) => {
  return <JsonEditor value={body} onChange={setBody} />;
};

export default BodyTab;
